import { emojifyInput, createElementFromHTML } from './shared'
import { injectInlinePopup } from './inline-popup'

// Features
// TODO: Use mutation observer vs. hacky timer & attributes
// TODO: Style grid popup a bit nicer
// TODO: Reactions
// TODO: Load some/all basic emojis into server
// TODO: Fix electron install
// TODO: Large emoji when no text
// TODO: Emoji server auth
// TODO: alt text & popover for emojis
// TODO: MRU

// Someday
// TODO: Background fetch on launch
// TODO: Websocket push when new emoji added
// TODO: Add emojis to server with "{pasted image}+:emojiname:"

// Bugs
// TODO: Clicking and inserting two subsequent emoji from grid inserts second
//   (and subsequent) emojis before cursor
// TODO: Get enter working for completion from inline popup

// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH
const PAGE_CONTENT_WRAPPER_ID = 'page-content-wrapper'
const MESSAGE_LIST_CONTAINER_CLASS = 'ts-message-list-container'
const MESSAGE_LIST_ITEM_CLASS = 'ts-message-list-item'
const NEW_MESSAGE_CLASS = 'ts-new-message'
const MESSAGE_CLASS = 'ts-message'
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

function createImgTag(emoticonName: string) {
	return (
		'<img class="emoji-img" src="' +
		emojiApiPath +
		"/emoji/" +
		emoticonName +
		'" title="' +
		emoticonName +
		'" loading="lazy">'
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
			createImgTag(emoji)
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
				emojifyInput(ckEditor, null, emoji)
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
let messageItemObserver: MutationObserver | undefined

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
		messageItemObserver?.disconnect()
		messageItemObserver = undefined
		return
	}

	const messageItemCallback = (mutationsList: MutationRecord[]) => {
		console.debug('teamojis: reply injected')
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
		if (cke)
			injectInlinePopup(cke, emojis)

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

	// observe the message list container for additions of message list items
	// when any are added, emojify the text in them
	// also observe the footer and inject the inline popup if a reply is started
	const messagesContainerObserverCallback = (mutationsList: MutationRecord[]) => {
		if (hasMessageListItems(mutationsList)) {
			const mutationRecords = mutationsList.filter((mr: MutationRecord) => mr.addedNodes.length > 0)
			mutationRecords.forEach((mr): void => {
				mr.addedNodes.forEach((node): void => {
					// filter out the comment nodes
					if (node.nodeName === 'DIV') {
						// emojify the message
						const messageListItem = ((node as HTMLDivElement).closest(`.${MESSAGE_LIST_ITEM_CLASS}`)) as Element
						console.debug(`teamojis: message-list-item injected position ${messageListItem.getAttribute('data-scroll-pos')}`)
						emojifyMessageDiv(messageListItem, emojis)

						// watch for replies
						if (!messageItemObserver)
							messageItemObserver = new MutationObserver(messageItemCallback)
						const repliesContainer = messageListItem.getElementsByClassName(MESSAGE_CLASS)[0]
						messageItemObserver.observe(repliesContainer, { childList: true })

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

	const isPageContentWrapper = (mutationRecord: MutationRecord ) => {
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
				console.debug('teamojis: page-content-wrapper injected')
				documentObserver?.disconnect()

				const messageListContainer = ([...mr.addedNodes][0] as Element)?.getElementsByClassName(MESSAGE_LIST_CONTAINER_CLASS)[0]
				messagesContainerObserver = new MutationObserver(messagesContainerObserverCallback)
				messagesContainerObserver.observe(messageListContainer, { childList: true })
			}
		})
	}

	
	documentObserver = new MutationObserver(documentCallback)
	documentObserver.observe(document, { childList: true, subtree: true })
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
