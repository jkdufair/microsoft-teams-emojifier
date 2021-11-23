import { CKEDITOR_CLASS, createImgTag, MESSAGE_LIST_ITEM_CLASS } from './shared'
import { injectInlinePopup } from './inline-popup'
import { injectGridPopupButton } from './grid-popup'

// Note: An emoji "command" is the name of the emoji surrounded by colons

// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH
const PAGE_CONTENT_WRAPPER_ID = 'page-content-wrapper'
const NEW_MESSAGE_ID = 'add-new-message'
const MESSAGE_LIST_CONTAINER_CLASS = 'ts-message-list-container'
const MESSAGE_CLASS = 'ts-message'
const MESSAGE_FOOTER_CLASS = 'ts-reply-message-footer'
const EMOJI_BUTTON_NODE_NAME = 'INPUT-EXTENSION-EMOJI-V2'
const emojiMatch = /:([\w-_]+):/g

/**
 * Fetch the emojis from the server then run resolve function with the list of the names.
 */
const getValidEmojis = () => {
	return new Promise((resolve: (emojis: string[]) => void, _) => {
		console.log('teamojis: fetching emojis')
		$.get(emojiApiPath + "/emojis", (result: string[]) => {
			console.log('teamojis: emojis fetched')
			resolve(result.sort())
		})
	})
}

/**
 * Utility function to execute a function on all children (recursive) of a DOM node.
 * @param element - the DOM element to operate on
 * @param handleLeaf - the function to execute on the leaf nodes
 */
const crawlTree = (element: Element, handleLeaf: { (leaf: Element): void }) => {
	if (element && element.childElementCount <= 0) {
		handleLeaf(element)
		return
	}
	[...element.children].forEach(element => {
		crawlTree(element, handleLeaf)
	})
}

/**
 * Given a string (normally some innerHTML), replace emoji commands with img tags.
 * @param text - the text to operate on
 * @param emojis - the list of emoji names
 */
const emojifyText = (text: string, emojis: string[]) => {
  var resultStr = ""
	var matches = text.matchAll(emojiMatch)
	var currentIndexInInput = 0

	var match
	while (!(match = matches.next()).done) {
		var reInjectText = match.value[0]
		if (emojis.indexOf(match.value[1]) != -1) {
			const emojiName = match.value[1]
			reInjectText = createImgTag(emojiName).outerHTML
		}

		resultStr += text.substring(currentIndexInInput, match.value.index)
		resultStr += reInjectText
		if (match.value.index != undefined)
			currentIndexInInput = match.value.index + match.value[0].length
	}
	resultStr += text.substring(currentIndexInInput, text.length)
	return resultStr
}

/**
 * Recursively replace any emoji commands in an element with img tags
 * @param element - The parent element to recurs
 * @param emojis - the list of emoji names
 */
const emojifyMessageDiv = (element: Element, emojis: string[]) => {
	crawlTree(element, (leaf: Element) => {
		leaf.innerHTML = emojifyText(
			leaf.innerHTML,
			emojis
		)
	})
}

let documentObserver: MutationObserver | undefined
let messagesContainerObserver: MutationObserver | undefined
let messageFooterObserver: MutationObserver | undefined
let messageItemReplyObserver: MutationObserver | undefined
let messageListItemObserver: MutationObserver | undefined
let newMessageObserver: MutationObserver | undefined

/**
 * Set up a chain of MutationObservers so we can
 * - emojify messages & replies that are created by us and others
 * - inject the inline popup for any replies
 *
 * If elements are already added to the DOM, (i.e. while we are loading emojis from the server),
 * emojify/inject them and set up child observers as necessary.
 *
 * Structure of messages/containers:
 * #page-content-wrapper (the main content that gets injected early by teams)
 *   .ts-message-list-container (container for all message list items and "new conversation")
 *     .ts-message-list-item (container for each message and its replies)
 *       .ts-message (sub-container for each message and its replies)
 *         .ts-message-thread-body
 *           .message-body
 *             .message-body-container
 *               .message-body-content (the actual message)
 *         .conversation-reply (one for each non-hidden reply)
 *         .ts-reply-message-footer (the footer where the ckeditor pops in)
 *           .cke_wysiwyg_div (the ckeditor itself)
 *
 * @param emojis - the list of emoji names
 */
const observeChanges = (emojis: string[]) => {
	if (!window.location.hash.includes('/conversations/')) {
		documentObserver?.disconnect()
		documentObserver = undefined
		messagesContainerObserver?.disconnect()
		messagesContainerObserver = undefined
		messageFooterObserver?.disconnect()
		messageFooterObserver = undefined
		messageItemReplyObserver?.disconnect()
		messageItemReplyObserver = undefined
		messageListItemObserver?.disconnect()
		messageListItemObserver = undefined
		newMessageObserver?.disconnect()
		newMessageObserver = undefined
		return
	}

	/**
	 * Callback for when message is being edited.
	 */
	const messageListItemCallback = (mutationsList: MutationRecord[]) => {
		// TODO un-copy-pasta this
		// Editing has started. Re-emojify the commands & inject the inline popup
		const cke = mutationsList.filter((mr: MutationRecord) =>
			[...mr.addedNodes].some((n: Node) =>
				(n as Element)?.classList?.contains(CKEDITOR_CLASS)))[0]?.addedNodes[0] as HTMLDivElement
		if (cke) {
			// Injection of content seems to happen later. Bit of a hack here.
			setTimeout(() => {
				console.log('teamojis: Edit started. Injecting images and inline popup.')
				const editMessageForm = cke.closest('.edit-message-form') as HTMLDivElement
				if (editMessageForm)
					editMessageForm.style.overflow = 'visible'
				const tsMessageThreadBody = editMessageForm.parentElement as HTMLDivElement
				if (tsMessageThreadBody)
					tsMessageThreadBody.style.overflow = 'visible'
				cke.innerHTML = emojifyText(cke.innerHTML, emojis)
				injectInlinePopup(cke, emojis)
			}, 100)
		} else {
			const addedNode = mutationsList.filter((mr: MutationRecord) => {
				return !!mr.addedNodes && [...mr.addedNodes].some((n: Node) => {
					const element = n as Element
					return !!element &&
						element.className &&
						typeof element.className === 'string' &&
						// TODO use classList here and everywhere
						// TODO use const for class name
						element.className.includes('message-body ')
				})
			})[0]?.addedNodes[0] as HTMLDivElement
			if (addedNode) {
				// Teams seems to re-render this after we try to re-emojify it. :sadparrot:
				setTimeout(() => {
					console.log('teamojis: Editing finished. Re-emojifying message')
					emojifyMessageDiv(addedNode.closest(`.${MESSAGE_LIST_ITEM_CLASS}`) as Element, emojis)
				}, 750)
			}
		}
	}

	const messageItemReplyCallback = (mutationsList: MutationRecord[]) => {
		console.log('teamojis: reply injected')
		mutationsList.forEach((mr: MutationRecord) => {
			emojifyMessageDiv(mr.addedNodes[0] as Element, emojis)
		})
	}

	/**
	 * Callback for new replies. When a reply is started, inject the inline popup in the reply
	 * ckeditor and the replacement preview button.
	*/
	const messageFooterCallback = (mutationsList: MutationRecord[]): void => {
		const cke = mutationsList.filter((mr: MutationRecord) =>
			[...mr.addedNodes].some((n: Node) =>
				(n as Element)?.classList?.contains(CKEDITOR_CLASS)))[0]?.addedNodes[0] as HTMLDivElement
		if (cke) {
			console.log('teamojis: Injecting inline popup for ckEditor')
			injectInlinePopup(cke, emojis)
		}

		// Teams seems to add and remove the emoji button 3 times or something.
		// The one where it's added and previous is removed is the one
		const candidateMutationRecords = mutationsList.filter((mr: MutationRecord) =>
			[...mr.addedNodes].some((n: Node) => {
				const inputExtension = n as Element
				return !!inputExtension && inputExtension.nodeName === EMOJI_BUTTON_NODE_NAME
			}) && [...mr.removedNodes].length > 0)
		if (candidateMutationRecords.length > 0) {
			const emojiButton = candidateMutationRecords[0].addedNodes[0].childNodes[2] as Element
			injectGridPopupButton(emojiButton, emojis)
		}
	}

	const hasMessageListItems = (mutationsList: MutationRecord[]) => {
		return mutationsList.some((mr: MutationRecord) =>
			mr.addedNodes.length > 0 &&
			[...mr.addedNodes].some((n: Node) => {
				const element = n as Element
				return !!element &&
					element.className &&
					typeof element.className === 'string' &&
					element.className.includes(MESSAGE_LIST_ITEM_CLASS)
			}))
	}

	// Observe the message list container for additions of message list items.  When any are added,
	// emojify the text in them. Also observe the footer of the message list item and inject the
	// inline popup if a reply is started
	const messageListContainerCallback = (mutationsList: MutationRecord[]) => {
		if (hasMessageListItems(mutationsList)) {
			const mutationRecords = mutationsList.filter((mr: MutationRecord) => mr.addedNodes.length > 0)
			mutationRecords.forEach((mr): void => {
				mr.addedNodes.forEach((node): void => {
					// Filter out the comment nodes
					if (node.nodeName === 'DIV') {
						// Emojify the message
						const messageListItem = ((node as HTMLDivElement).closest(`.${MESSAGE_LIST_ITEM_CLASS}`)) as Element
						console.log(`teamojis: .message-list-item injected at position ${messageListItem.getAttribute('data-scroll-pos')}`)
						emojifyMessageDiv(messageListItem, emojis)

						// Watch for replies
						if (!messageItemReplyObserver)
							messageItemReplyObserver = new MutationObserver(messageItemReplyCallback)
						const repliesContainer = messageListItem.getElementsByClassName(MESSAGE_CLASS)[0]
						messageItemReplyObserver.observe(repliesContainer, { childList: true })

						// Watch for edits
						if (!messageListItemObserver)
							messageListItemObserver = new MutationObserver(messageListItemCallback)
						messageListItemObserver.observe(messageListItem, { childList: true, subtree: true })

						// Watch the reply footer for a new editor to be created. inject inline popup
						if (!messageFooterObserver)
							messageFooterObserver = new MutationObserver(messageFooterCallback)
						const replyMessageFooter = messageListItem.getElementsByClassName(MESSAGE_FOOTER_CLASS)[0] as Element
						messageFooterObserver.observe(replyMessageFooter, { childList: true, subtree: true })
					}
				})
			})
		}
	}

	const isPageContentWrapper = (mutationRecord: MutationRecord) => {
		return [...mutationRecord.addedNodes]
			.some((n: Node) => {
				const element = n as Element
				return !!element &&
					element.id === PAGE_CONTENT_WRAPPER_ID
			})
	}

	const observePageContentWrapperChanges = (pageContentWrapper: Element) => {
		if (!pageContentWrapper) {
			console.log('teamojis error: pageContentWrapper not added as the first node!')
		} else {
			// Emojify the messages that have already been injected
			for (const messageListItem of document.getElementsByClassName(MESSAGE_LIST_ITEM_CLASS)) {
				emojifyMessageDiv(messageListItem, emojis)
			}
			console.log('teamojis: Observing mutations for .message-list-container')
			const messageListContainer = pageContentWrapper.getElementsByClassName(MESSAGE_LIST_CONTAINER_CLASS)[0]
			messagesContainerObserver = new MutationObserver(messageListContainerCallback)
			messagesContainerObserver.observe(messageListContainer, { childList: true })
		}

		// Observe for composing new messages at the bottom. We have to observe the whole
		// #add-new-message since the ckeditor gets injected dynamically later than this point in
		// the apps DOM construction.
		console.log('teamojis: Observing mutations for #add-new-message')
		const newMessageContainer = document.getElementById(NEW_MESSAGE_ID) as HTMLElement
		newMessageObserver = new MutationObserver(messageFooterCallback)
		newMessageObserver.observe(newMessageContainer, { childList: true, subtree: true })
	}

	// Observe the whole document. Find the messages container ASAP and disconnect
	const documentCallback = (mutationsList: MutationRecord[]) => {
		mutationsList.forEach((mr: MutationRecord) => {
			if (isPageContentWrapper(mr)) {
				// Message container list parent was injected. Disconnect and observe the
				// message-list-container for additions of individial message list items
				console.log('teamojis: .page-content-wrapper injected. Disconnecting document observer.')
				documentObserver?.disconnect()

				// Observe for new messages in the list
				// First added node should be the page-content-wrapper div, second should be a comment (ignored)
				const pageContentWrapper = [...mr.addedNodes][0] as Element
				observePageContentWrapperChanges(pageContentWrapper)
			}
		})
	}

	// Only observe the whole document if the page content wrapper has not been injected yet
	// otherwise, observe the children
	const pageContentWrapper = document.getElementById(PAGE_CONTENT_WRAPPER_ID) as Element
	if (!pageContentWrapper) {
		console.log('teamojis: Observing whole document for PageContentWrapper')
		documentObserver = new MutationObserver(documentCallback)
		documentObserver.observe(document, { childList: true, subtree: true })
	} else {
		console.log('teamojis: PageContentWrapper exists. Observing changes to contents')
		observePageContentWrapperChanges(pageContentWrapper)
	}
}

/**
 * Disable some built-in Teams :eww: stuff. Get the emojis and set up the Teamojinator for action!
 */
const init = () => {
	// Disable Teams' :stupit: auto-emoji generation. We can handle our own colons just fine, tyvm
	// @ts-ignore
	teamspace.services.EmoticonPickerHandler.prototype.handleText = function() { }
	// @ts-ignore
	teamspace.services.EmoticonPickerHandler.prototype.insertInEditor = function() { }

	getValidEmojis().then((emojis: string[]) => {
		observeChanges(emojis)
		window.addEventListener('hashchange', () => {
			observeChanges(emojis)
		})
	})
}

init()
