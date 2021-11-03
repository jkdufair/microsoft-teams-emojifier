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
const emojiClass = "EMOJIFIER-CHECKED"
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
	if (htmlElement.childElementCount <= 0) {
		handleLeaf(htmlElement)
		return
	}
	for (let index = 0; index < htmlElement.children.length; index++) {
		const htmlChildElement = htmlElement.children[index]
		crawlTree(htmlChildElement, handleLeaf)
	}
}

function injectEmojiImages(inputText: string, validEmojis: string[], emojisUsed: { [x: string]: number; }) {
	var resultStr = ""
	var matches = inputText.matchAll(emojiMatch)
	var currentIndexInInput = 0

	var match
	while (!(match = matches.next()).done) {
		var reInjectText = match.value[0]
		if (validEmojis.indexOf(match.value[1]) != -1) {
			const emojiName = match.value[1]
			reInjectText = createImgTag(emojiName)
			emojisUsed[emojiName] =
				(emojisUsed[emojiName] === undefined ? 0 : emojisUsed[emojiName]) + 1
		}

		resultStr += inputText.substring(currentIndexInInput, match.value.index)
		resultStr += reInjectText
		if (match.value.index != undefined)
			currentIndexInInput = match.value.index + match.value[0].length
	}
	resultStr += inputText.substring(currentIndexInInput, inputText.length)
	return resultStr
}

function emojifyMessageDiv(div: Element, validEmojis: string[], emojisUsed: { [x: string]: number; }) {
	crawlTree(div, (leaf: Element) => {
		leaf.innerHTML = injectEmojiImages(
			leaf.innerHTML,
			validEmojis,
			emojisUsed
		)
	})
	div.classList.add(emojiClass)
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
		for (const element of document.getElementsByClassName('ts-message-list-item')) {
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

function getEmojiPreviewButtonList() {
	return $(
		"input-extension-emoji-v2 > button:not(." + emojiClass + ")"
	).toArray()
}

function injectPreviewButtons(emojiList: string[]) {
	var emojiButtons = getEmojiPreviewButtonList()
	emojiButtons.forEach((button) => {
		injectPreviewButton(button, emojiList)
	})
}

function injectPreviewButton(previousPreviewButton: HTMLElement, emojiList: string[]) {
	previousPreviewButton.classList.add(emojiClass)
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
			const ckEditor = (buttonContainer as HTMLElement)?.closest('.ts-new-message')?.querySelector('.cke_wysiwyg_div') as HTMLDivElement
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

function init() {
	// Disable Teams' :stupit: auto-emoji generation. We can handle our own colons just fine, tyvm
	// @ts-ignore
	teamspace.services.EmoticonPickerHandler.prototype.handleText = function() { }
	// @ts-ignore
	teamspace.services.EmoticonPickerHandler.prototype.insertInEditor = function() { }

	getValidEmojis().then((emojis: string[]) => {
		var emojisUsed = {}
		let documentObserver: MutationObserver
		let messagesContainerObserver: MutationObserver
		const config = { childList: true, subtree: true }
		const callback = (mutationsList: MutationRecord[]) => {
			mutationsList.forEach((mr: MutationRecord) => {
				// We are observing the whole document. Find the messages container
				// ASAP and disconnect observing the whole document
				// TODO: handle routing changes?
				// TODO: what if we're on another route? We'll observe the whole document forever
				if ([...mr.addedNodes]
					.some((n: Node) =>
						!!(n as HTMLDivElement)?.className &&
						typeof (n as HTMLDivElement)?.className === 'string' &&
						(n as HTMLDivElement)?.className.startsWith('ts-middle '))) {
					// Found the message container parent that angular injected. Disconnect and observe the
					// immediate parent of the individual message bodies
					documentObserver.disconnect()

					const element = ([...mr.addedNodes][0] as HTMLDivElement)?.getElementsByClassName('ts-message-list-container')[0]
					messagesContainerObserver = new MutationObserver((messagesMutationsList: MutationRecord[]) => {
						// We're only interested in the message body divs that get added to the DOM
						if (messagesMutationsList.some((mr: MutationRecord) => mr.addedNodes.length > 0 &&
							[...mr.addedNodes].some((n: Node) =>
								!!(n as HTMLDivElement)?.className &&
								typeof (n as HTMLDivElement)?.className === 'string' &&
								(n as HTMLDivElement)?.className.includes('ts-message-list-item')))) {
							const mutationRecords = messagesMutationsList.filter((mr: MutationRecord) => mr.addedNodes.length > 0)
							mutationRecords.forEach((mr): void => {
								mr.addedNodes.forEach((node): void => {
									// filter out the comment nodes
									if (node.nodeName === 'DIV')
										emojifyMessageDiv((node as HTMLDivElement).getElementsByClassName('message-body-content')[0], emojis, emojisUsed)
								})
							})
						}
					})
					messagesContainerObserver.observe(element, { childList: true })
				}

			})
		}
		documentObserver = new MutationObserver(callback)
		documentObserver.observe(document, config)

		injectPreviewButtons(emojis)

		setInterval(() => {
			var ckEditors = document.getElementsByClassName('cke_wysiwyg_div')
			for (const ckEditor of ckEditors) {
				const cke = ckEditor as HTMLDivElement
				if (cke.getAttribute('emojiCommandListener') === null) {
					ckEditor.setAttribute('emojiCommandListener', 'true')
					injectInlinePopup(cke, emojis)
				}
			}
		}, 1000)
		// setInterval(() => {
		//   if (Object.keys(emojisUsed).length <= 0) {
		//     return
		//   }
		//   postEmojiUsages(emojisUsed).then((posted) => {})
		//   emojisUsed = {}
		// }, 10000)
	})
}

init()
