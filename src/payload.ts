// Mini-popup
// TODO: Keyboard control - up ✅, down ✅, enter/tab, escape ✅ & mouse hover
// TODO: Clicking in minipop doesn't work
// TODO: Don't cut off in replies
// TODO: Fuzzy filter & highlight fuzzy matches
// TODO: Handle no items in filter

// Features
// TODO: Use mutation observer vs. hacky timer & attributes
// TODO: Style grid popup a bit nicer
// TODO: Reactions
// TODO: Background fetch on launch
// TODO: Websocket push when new emoji added
// TODO: Load some/all basic emojis into server
// TODO: Fix electron install
// TODO: Large emoji when no text
// TODO: Simple URL-based auth for server to keep out the riffraff
// TODO: Add emojis to server with "{pasted image}+:emojiname:"
// TODO: alt text & popover for emojis
// TODO: MRU?

// Housekeeping
// TODO: eslint
// TODO: SASS/LESS
// TODO: webpack

// Bugs
// TODO: Clicking and inserting two subsequent emoji from grid inserts second
//   (and subsequent) emojis before cursor


// Make sure the payload is injected only once per context at most
// Lots types we don't have for this stuff so we're ignoring it
// TODO - look into how to do this more typescript-y
// @ts-ignore
if (window.SECRET_EMOJI_KEY != "set") {
	// @ts-ignore
	window.SECRET_EMOJI_KEY = "set"
	// @ts-ignore
	if (window.EMOJI_API) {
		// if this is an injection into the electron app
		setTimeout(() => {
			// @ts-ignore
			inject(window.EMOJI_API, window)
		}, 1000)
		// @ts-ignore
	} else if (window.chrome && window.chrome.storage) {
		function breakIntoTopPageScope(javascriptString: string) {
			const script = document.createElement("script")
			script.setAttribute("type", "text/javascript")
			script.innerHTML = javascriptString

			const header = document.getElementsByTagName("head")[0]
			header.appendChild(script)
		}
		// if we are in the chrome extension
		// @ts-ignore
		chrome.storage.sync.get("api-url", (data) => {
			setTimeout(() => {
				const EMOJI_URL = data["api-url"]
				//we need to break into the top-level scope to make use of the JQuery-lite utility that already exists in ms-teams
				breakIntoTopPageScope(
					inject.toString() + ";inject('" + EMOJI_URL + "');"
				)
			}, 1000)
		})
	}
}

function inject(emojiApiPath: string | undefined) {
	const emojiClass = "EMOJIFIER-CHECKED"
	const emojiMatch = /:([\w-_]+):/g
	const miniPopupClassName = 'emoji-inline-popup'
	const hiddenEmojiMatch = /<img class="emoji-img" src="http.+?\/emoji\/(.*?)">/g

	function getValidEmojis() {
		return new Promise((resolve: (emojis: string[]) => void, _) => {
			$.get(emojiApiPath + "/emojis", (result: string[]) => {
				resolve(result.sort())
			})
		})
	}

	// function postEmojiUsages(emojiUsages) {
	//   return new Promise((resolve, reject) => {
	//     $.post({
	//       url: emojiApiPath + "/emojis/usage",
	//       data: JSON.stringify(emojiUsages),
	//       processData: false,
	//       contentType: "application/json",
	//       success: () => resolve(),
	//     })
	//   })
	// }

	function getMessageContentList() {
		return $(".message-body-content > div:not(." + emojiClass + ")").toArray()
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

	function createElementFromHTML(htmlString: string) {
		var div = document.createElement("div")
		div.innerHTML = htmlString.trim()
		return div.firstChild
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

	/**
	 * Replace the partially or fully entered emoji command (colon plus an emoji name) with an img tag
	 * to the emoji server
	 *
	 * @param ckEditor - the element the user has typed into
	 * @param commandText - the command (possibly incomplete) they have typed (i.e. :arn or :arnold)
	 * @param emoji - the name of the emoji to use in the img tag
	 */
	function emojifyInput(ckEditor: HTMLDivElement, commandText: string | null, emoji: string) {
		// consolidate potentially split text nodes
		ckEditor?.parentNode?.normalize()
		ckEditor.focus()
		let selection = window.getSelection()
		let commandRange = selection?.getRangeAt(0)

		if (commandRange) {
			// delete any part of command that was typed (i.e. :lun or :lunch)
			if (selection && selection.anchorNode && commandText) {
				const caretPosition = commandRange.endOffset
				commandRange.setStart(selection.anchorNode, caretPosition - commandText.length - 2) // the two colons
				commandRange.setEnd(selection.anchorNode, caretPosition)
				commandRange.deleteContents()
			}

			// insert img tag for emoji
			const emojiImage = document.createElement('img')
			emojiImage.classList.add('emoji-img')
			emojiImage.src = `https://emoji-server.azurewebsites.net/emoji/${emoji.replaceAll(':', '')}`
			commandRange.insertNode(emojiImage)

			// Put cursor after emoji
			commandRange.collapse()
		}
	}

	function unemojifyInput(ckEditor: HTMLElement) {
		console.log('matches', ckEditor.innerHTML.match(hiddenEmojiMatch))
		ckEditor.innerHTML = ckEditor.innerHTML.replaceAll(hiddenEmojiMatch, ":$1:")
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

	/**
	 * Given some text in which a range exists return the "command" which is the text between the
	 * first colon up to the next space (or the end of the string)
	 *
	 * @param rangeData The string in which to look for a command
	 */
	function getCommand(rangeData: string | undefined): string | undefined {
		if (!rangeData) return undefined

		const matchWholeCommand = rangeData.match(/:(.+):/)
		if (matchWholeCommand) return matchWholeCommand[1]

		const matchPartialCommand = rangeData.match(/:([^ ]+).*$/)
		if (matchPartialCommand) return matchPartialCommand[1]

		return undefined
	}

	function createMiniPopup(emojiList: string[],
		emojiSelectedListener: { (event: Event | null, commandText: string, emoji: string): void }) {
		const popup = document.createElement('div')
		popup.classList.add(miniPopupClassName)

		let filter = ""
		let filteredEmojis: string[] = emojiList
		let highlightedIndex = 0
		const emojiChangeListeners = emojiList.map(emoji => {
			const emojiElement = createElementFromHTML(
				createImgTag(emoji)
			) as HTMLImageElement
			const span = document.createElement('span')
			span.innerText = `:${emoji}:`
			const div = document.createElement('div') as HTMLDivElement
			div.classList.add('mini-popup-item')
			div.appendChild(emojiElement)
			div.appendChild(span)

			emojiElement.addEventListener("click", (event) => {
				emojiSelectedListener(event, `:${filter}`, emoji)
				onClose()
			})
			popup.appendChild(div)

			const filterHandler = (toFilter: string) => {
				// save the filter in the outer scope for deleting from the ckEditor
				if (filter !== toFilter)
					filter = toFilter

				div.style.display = filterEmoji(emoji, toFilter)
					? "block"
					: "none"
			}

			const highlightHandler = (index: number) => {
				if (filteredEmojis.indexOf(emoji) == index) {
					div.classList.add('highlighted')
					// @ts-ignore (supported by Chrome)
					div.scrollIntoViewIfNeeded(false)
				} else {
					div.classList.remove('highlighted')
				}
			}

			return {
				filterHandler,
				highlightHandler
			}
		})

		const onOpen = () => {
			popup.style.display = "block"
		}

		const onClose = () => {
			emojiChangeListeners.forEach(handlers => { handlers.filterHandler("") })
			popup.style.display = "none"
		}

		const onFilter = (toFilter: string) => {
			filteredEmojis = emojiList.filter(e => e.includes(toFilter))
			filter = toFilter
			emojiChangeListeners.forEach(handlers => { handlers.filterHandler(filter) })
			onHighlight(0)
		}

		const onHighlight = (index: number) => {
			emojiChangeListeners.forEach(handlers => { handlers.highlightHandler(index) })
			highlightedIndex = index
		}

		const onHighlightNext = () => {
			if (highlightedIndex + 1 <= filteredEmojis.length - 1)
				highlightedIndex++
			else
				highlightedIndex = 0
			emojiChangeListeners.forEach(handlers => { handlers.highlightHandler(highlightedIndex) })
		}

		const onHighlightPrevious = () => {
			if (highlightedIndex - 1 >= 0)
				highlightedIndex--
			else
				highlightedIndex = filteredEmojis.length - 1
			emojiChangeListeners.forEach(handlers => { handlers.highlightHandler(highlightedIndex) })
		}

		return {
			element: popup,
			onOpen,
			onClose,
			onFilter,
			onHighlight,
			onHighlightNext,
			onHighlightPrevious
		}
	}

	function injectMiniPopup(ckEditor: HTMLDivElement, emojiList: string[]) {
		ckEditor.classList.add(emojiClass)
		const {
			element: miniPopup,
			onOpen,
			onClose,
			onFilter,
			onHighlight,
			onHighlightNext,
			onHighlightPrevious
		} = createMiniPopup(
			emojiList,
			(_: Event | null, commandText: string, emoji: string) => {
				emojifyInput(ckEditor, commandText, emoji)
			}
		)

		let isOpen = false
		// inject the mini popup as a sibling before the ckEditor component
		if (ckEditor?.parentElement?.querySelector(`.${miniPopupClassName}`) === null) {
			ckEditor?.parentElement?.insertBefore(miniPopup, ckEditor)
		}

		const closeIfOpen = () => {
			if (isOpen) {
				onClose()
				isOpen = false
			}
		}

		ckEditor.addEventListener("blur", function() {
			closeIfOpen()
		})

		ckEditor.addEventListener("click", () => {
			closeIfOpen()
		})

		ckEditor.addEventListener("keydown", e => {
			// TODO: Enter does not submit the form sometimes
			const event = e as KeyboardEvent
			// Submitting form - unemojify commands
			if (event.key === 'Enter' && !isOpen)
				unemojifyInput(ckEditor)
		})

		ckEditor.addEventListener("keyup", (e: Event) => {
			const selection = window.getSelection()
			const commandRange = selection?.getRangeAt(0)

			// put listener on submit button if not already there
			const footerElement = ckEditor.closest('.ts-new-message-footer')
			if (footerElement && !footerElement.getAttribute('emojiSubmitListener')) {
				footerElement.setAttribute('emojiSubmitListener', 'true')
				const extensionIconsContainerElement = footerElement.nextElementSibling
				if (extensionIconsContainerElement) {
					const button = extensionIconsContainerElement.querySelector('.icons-send.inset-border')
					if (button) {
						button.addEventListener('mousedown', function() {
							unemojifyInput(ckEditor)
						})
					}
				}
			}

			const event = e as KeyboardEvent
			if (event.key === 'ArrowDown' && isOpen) {
				onHighlightNext()
				event.preventDefault()
			}
			if (event.key === 'ArrowUp' && isOpen) {
				onHighlightPrevious()
				event.preventDefault()
			}

			/*
			 * Handle inline typing of emojis, i.e. :foobar:
			 *
			 * When emoji typing is complete, put that text into a hidden div and put an img tag with the
			 * emoji itself in the editor. Teams can't handle the img tag when submitted, so remove it when
			 * submitting, unhide the emoji text, and let the other logic in this plugin handle it when it's
			 * subsequently displayed
			 */
			(ckEditor.parentElement as HTMLDivElement).style.overflow = "visible"
			for (const element of document.getElementsByClassName('ts-new-message-footer-content')) {
				(element as HTMLDivElement).style.overflow = "visible"
			}

			const command = getCommand((commandRange?.commonAncestorContainer as Text).wholeText)
			if (command && (event.key.match(/^[a-z0-9_]$/i) || event.key === "Backspace")) {
				onFilter(command)

				if (command.length >= 2 && !isOpen) {
					// we have at least two letters. open inline search
					onOpen()
					isOpen = true
				}

				// close inline search - need at least two letters to search
				if (command.length < 2) {
					onClose()
					isOpen = false
				}
			}

			// User ended command. Emojify!
			if (command && event.key === ':') {
				if (isOpen) {
					onClose()
					isOpen = false
				}
				// replace emoji text with hidden div & the emoji image
				if (ckEditor.innerHTML && emojiList.indexOf(command) != -1) {
					event.preventDefault()
					emojifyInput(ckEditor, command, command)
				}
			}

			miniPopup.style.top = `-${miniPopup.clientHeight}px`			
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
			setInterval(() => {
				var messageList = getMessageContentList()
				messageList.forEach((div): void =>
					emojifyMessageDiv(div, emojis, emojisUsed)
				)
				injectPreviewButtons(emojis)

				var ckEditors = document.getElementsByClassName('cke_wysiwyg_div')
				for (const ckEditor of ckEditors) {
					const cke = ckEditor as HTMLDivElement
					if (cke.getAttribute('emojiCommandListener') === null) {
						ckEditor.setAttribute('emojiCommandListener', 'true')
						injectMiniPopup(cke, emojis)
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
}
