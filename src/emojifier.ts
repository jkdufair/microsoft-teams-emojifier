import { emojifyCommand, createElementFromHTML } from './shared'
import { injectInlinePopup } from './inline-popup'

// Required Features
// TODO: Fix electron install
// TODO: Reactions
// TODO: Style grid popup a bit nicer
// TODO: Load some/all basic emojis into server
// TODO: Periodic emoji refresh

// Nice to have someday
// TODO: Large emoji when no text
// TODO: Emoji server auth
// TODO: alt text & popover for emojis
// TODO: MRU
// TODO: Websocket push when new emoji added
// TODO: Add emojis to server with "{pasted image}+:emojiname:"

// Bugs
// TODO: Clicking and inserting two subsequent emoji from grid inserts second
//   (and subsequent) emojis before cursor
// TODO: Get enter working for completion from inline popup
// TODO: Editing a message or reply - no inline popup. And :stupit: Teams emojis instead :eww:
// TODO: Sometimes not loading on startup
// TODO: First conversation in a channel not emojifying (until the :stupit: "let's get the conversation started" header no longer appears)
// TODO: Handle non-square emojis in grid better than forcing them to be square
// TODO: Handle hashchange better (navigate to "Teams" on sidebar then come back. No workie anymore)

// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH
const PAGE_CONTENT_WRAPPER_ID = 'page-content-wrapper'
const NEW_MESSAGE_ID = 'add-new-message'
const MESSAGE_LIST_CONTAINER_CLASS = 'ts-message-list-container'
const MESSAGE_LIST_ITEM_CLASS = 'ts-message-list-item'
const MESSAGE_CLASS = 'ts-message'
const NEW_MESSAGE_CLASS = 'ts-new-message'
const MESSAGE_FOOTER_CLASS = 'ts-reply-message-footer'
const CKEDITOR_CLASS = 'cke_wysiwyg_div'
const EMOJI_BUTTON_NODE_NAME = 'INPUT-EXTENSION-EMOJI-V2'
const emojiMatch = /:([\w-_]+):/g

function getValidEmojis() {
	return new Promise((resolve: (emojis: string[]) => void, _) => {
		$.get(emojiApiPath + "/emojis", (result: string[]) => {
			resolve(result.sort())
		})
	})
}

function createImgTag(emoticonName: string, shouldBeSquare = false) {
	return (
		`<img class="emoji-img${shouldBeSquare ? ' square' : ''}" src="${emojiApiPath}/emoji/${emoticonName}" title="${emoticonName}" loading="lazy">`
	)
}

function crawlTree(htmlElement: Element, handleLeaf: { (leaf: Element): void }) {
	if (htmlElement && htmlElement.childElementCount <= 0) {
		handleLeaf(htmlElement)
		return
	}
	for (let index = 0; index < htmlElement.children.length; index++) {
		const htmlChildElement = htmlElement.children[index]
		crawlTree(htmlChildElement, handleLeaf)
	}
}

function injectEmojiImages(inputText: string, validEmojis: string[]) {
	var resultStr = ""
	var matches = inputText.matchAll(emojiMatch)
	var currentIndexInInput = 0

	var match
	while (!(match = matches.next()).done) {
		var reInjectText = match.value[0]
		if (validEmojis.indexOf(match.value[1]) != -1) {
			const emojiName = match.value[1]
			reInjectText = createImgTag(emojiName)
		}

		resultStr += inputText.substring(currentIndexInInput, match.value.index)
		resultStr += reInjectText
		if (match.value.index != undefined)
			currentIndexInInput = match.value.index + match.value[0].length
	}
	resultStr += inputText.substring(currentIndexInInput, inputText.length)
	return resultStr
}

function emojifyMessageDiv(div: Element, validEmojis: string[]) {
	crawlTree(div, (leaf: Element) => {
		leaf.innerHTML = injectEmojiImages(
			leaf.innerHTML,
			validEmojis
		)
	})
}

function generateFilterBox(onFilterChange: { (newFilter: string): void },
	debounce: number | undefined,
	onFilterSelected: { (selectedFilter: string): void }) {
	const inputBox = document.createElement("input")
	inputBox.placeholder = "🔍  Search"
	let lastTimeout = 0

	inputBox.addEventListener("input", (_) => {
		window.clearTimeout(lastTimeout)
		lastTimeout = window.setTimeout(() => {
			var filterValue = inputBox.value
			onFilterChange(filterValue)
		}, debounce)
	})

	inputBox.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			onFilterSelected(inputBox.value)
		}
	})

	const inputBoxContainer = document.createElement("div")
	inputBoxContainer.id = "emoji-input-box-container"
	inputBoxContainer.appendChild(inputBox)
	return inputBoxContainer
}

function filterEmoji(emojiName: string, filterText: string) {
	return emojiName.includes(filterText)
}

function createEmojiGrid(emojiList: string[],
	emojiSelectedListener: { (event: Event | null, emoji: string): void },
	closeListener: { (event: Event | undefined): void }) {
	const table = document.createElement("div")
	table.classList.add("emoji-flex-table")

	let emojiFilterChangeListeners: (((filter: string) => void) | undefined)[] = []
	const onClose = (event?: Event | undefined) => {
		// FIXME
		//filterBox.value = ""
		emojiFilterChangeListeners.forEach((onchange) => { if (onchange) onchange("") })
		closeListener(event)
	}
	const filterBox = generateFilterBox(
		(newFilter: string) => {
			emojiFilterChangeListeners.forEach((onchange) => { if (onchange) onchange(newFilter) })

			emojiTableContainer.scrollTop = emojiTableContainer.scrollHeight
		},
		500,
		(selectedFilter: string) => {
			var emoji = emojiList.find((emoji) => emoji.includes(selectedFilter))
			if (emoji)
				emojiSelectedListener(null, emoji)
			onClose()
		}
	)
	emojiFilterChangeListeners = emojiList.map((emoji) => {
		const emojiElement = createElementFromHTML(
			createImgTag(emoji, true)
		) as HTMLImageElement
		if (emojiElement) {
			emojiElement.addEventListener("click", (event) => {
				emojiSelectedListener(event, emoji)
				onClose(event)
			})
			table.appendChild(emojiElement)
			return (newFilter: string) => {
				emojiElement.style.display = filterEmoji(emoji, newFilter)
					? "block"
					: "none"
			}
		}
	})

	const outputT = document.createElement("div")
	outputT.className = "emoji-popup"

	const emojiTableContainer = document.createElement("div")
	emojiTableContainer.className = "emoji-flex-table-container"
	emojiTableContainer.appendChild(table)

	outputT.appendChild(emojiTableContainer)
	outputT.appendChild(filterBox)

	const onOpen = () => {
		outputT.style.display = "block"
		// Turn off watermark since so it doesn't look jumbled when selecting an emoji and no other
		// text has been entered
		document.getElementsByClassName('ts-text-watermark')[0].textContent = ""
		// don't cut off the popover in replies
		for (const element of document.getElementsByClassName(MESSAGE_LIST_ITEM_CLASS)) {
			(element as HTMLDivElement).style.overflow = "visible"
		}
		emojiTableContainer.scrollTop = emojiTableContainer.scrollHeight;
		(filterBox.firstChild as HTMLInputElement).focus()
	}
	return {
		element: outputT,
		onOpen,
		onClose,
	}
}

function injectPreviewButton(previousPreviewButton: Element, emojiList: string[]) {
	// Clone the control to disconnect all event listeners
	var emojiCloned = previousPreviewButton.cloneNode(true)
	var buttonContainer = previousPreviewButton.parentNode
	if (buttonContainer)
		buttonContainer.replaceChild(emojiCloned, previousPreviewButton)

	var open = false
	var {
		element: emojiTable,
		onOpen,
		onClose,
	} = createEmojiGrid(
		emojiList,
		(_: Event | null, emoji: string) => {
			const ckEditor = (buttonContainer as HTMLElement)?.closest(`.${NEW_MESSAGE_CLASS}`)?.querySelector(`.${CKEDITOR_CLASS}`) as HTMLDivElement
			if (ckEditor)
				emojifyCommand(ckEditor, null, emoji)
		},
		(_) => {
			emojiTable.style.display = "none"
			open = false
		}
	)
	if (buttonContainer)
		buttonContainer.appendChild(emojiTable)

	emojiCloned.addEventListener("click", () => {
		if (open) {
			onClose()
			open = false
		} else {
			onOpen()
			open = true
		}
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

	const messageListItemCallback = (mutationsList: MutationRecord[]) => {
		// TODO un-copy-pasta this
		const mutationRecord = mutationsList.filter((mr: MutationRecord) =>
			[...mr.addedNodes].some((n: Node) =>
				(n as Element)?.classList?.contains(CKEDITOR_CLASS)))[0]
		const cke = mutationRecord?.addedNodes[0] as HTMLDivElement
		if (cke) {
			// Injection of content seems to happen later. Bit of a hack here.
			setTimeout(() => {
				const editMessageForm = cke.closest('.edit-message-form') as HTMLDivElement
				if (editMessageForm)
					editMessageForm.style.overflow = 'visible'
				const tsMessageThreadBody = editMessageForm.parentElement as HTMLDivElement
				if (tsMessageThreadBody)
					tsMessageThreadBody.style.overflow = 'visible'
				cke.innerHTML = injectEmojiImages(cke.innerHTML, emojis)
				injectInlinePopup(cke, emojis)
			}, 100)
		}
	}

	const messageItemReplyCallback = (mutationsList: MutationRecord[]) => {
		console.log('teamojis: reply injected')
		mutationsList.forEach((mr: MutationRecord) => {
			emojifyMessageDiv(mr.addedNodes[0] as Element, emojis)
		})
	}

	// when a reply is started, inject the inline popup in the reply ckeditor
	// and the replacement preview button
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
			injectPreviewButton(emojiButton, emojis)
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
					// filter out the comment nodes
					if (node.nodeName === 'DIV') {
						// emojify the message
						const messageListItem = ((node as HTMLDivElement).closest(`.${MESSAGE_LIST_ITEM_CLASS}`)) as Element
						console.log(`teamojis: .message-list-item injected at position ${messageListItem.getAttribute('data-scroll-pos')}`)
						emojifyMessageDiv(messageListItem, emojis)

						// watch for replies
						if (!messageItemReplyObserver)
							messageItemReplyObserver = new MutationObserver(messageItemReplyCallback)
						const repliesContainer = messageListItem.getElementsByClassName(MESSAGE_CLASS)[0]
						messageItemReplyObserver.observe(repliesContainer, { childList: true })

						// watch for edits
						if (!messageListItemObserver)
							messageListItemObserver = new MutationObserver(messageListItemCallback)
						messageListItemObserver.observe(messageListItem, { childList: true, subtree: true})

						// watch the reply footer for a new editor to be created. inject inline popup
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

	// Observe the whole document. Find the messages container ASAP and disconnect
	const documentCallback = (mutationsList: MutationRecord[]) => {
		mutationsList.forEach((mr: MutationRecord) => {
			if (isPageContentWrapper(mr)) {
				// message container list parent was injected. Disconnect and observe the message-list-container for
				// additions of individial message list items
				console.log('teamojis: .page-content-wrapper injected. Disconnecting document observer.')
				documentObserver?.disconnect()

				// observe for new messages in the list
				// first added node should be the page-content-wrapper div, second should be a comment (ignored)
				const pageContentWrapper = [...mr.addedNodes][0] as Element
				if (!pageContentWrapper) {
					console.log('teamojis error: pageContentWrapper not added as the first node!')
				} else {
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
		})
	}

	// Only observe the whole document if the page content wrapper has not been injected yet
	// otherwise, we should be fine because all the other observers should be set up for us
	if (!document.getElementById(PAGE_CONTENT_WRAPPER_ID)) {
		documentObserver = new MutationObserver(documentCallback)
		documentObserver.observe(document, { childList: true, subtree: true })
		console.log('teamojis: Observing whole document')
	}
}

function init() {
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
