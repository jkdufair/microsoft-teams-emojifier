import fuzzysort from 'fuzzysort'
import { emojifyCommand, createElementFromHTML, createImgTag } from './shared'

// fuzzysort does not appear to export types - replicating here
interface Result {
	/**
	* Higher is better
	*
	* 0 is a perfect match; -1000 is a bad match
	*/
	readonly score: number

	/** Your original target string */
	readonly target: string

	/** Indexes of the matching target characters */
	readonly indexes: number[]
}
interface Results extends ReadonlyArray<Result> {
	/** Total matches before limit */
	readonly total: number
}

interface EmojiChangeListener {
	div: HTMLDivElement,
	highlightHandler: (index: number, shouldScroll?: boolean) => void
}

const inlinePopupClassName = 'emoji-inline-popup'
const hiddenEmojiMatch = /<img class="emoji-img" src="http.+?\/emoji\/(.*?)".*?>/g

const unemojifyInput = (ckEditor: HTMLElement) => {
	ckEditor.innerHTML = ckEditor.innerHTML.replaceAll(hiddenEmojiMatch, ":$1:")
}

/**
 * Given some text in which a range exists return the "command" which is the text between the
 * first colon up to the next space (or the end of the string)
 *
 * @param rangeData The string in which to look for a command
 */
const getCommand = (rangeData: string | undefined): string | undefined => {
	if (!rangeData) return undefined

	const matchWholeCommand = rangeData.match(/:(.+):/)
	if (matchWholeCommand) return matchWholeCommand[1]

	const matchPartialCommand = rangeData.match(/:([^ ]+).*$/)
	if (matchPartialCommand) return matchPartialCommand[1]

	return undefined
}

const createInlinePopup = (emojiList: string[],
	emojiSelectedListener: { (event: Event | null, commandText: string, emoji: string): void }) => {
	const popup = document.createElement('div')
	popup.classList.add(inlinePopupClassName)
	let highlightedIndex = 0
	let emojiChangeListeners: EmojiChangeListener[]
	let fuzzySorted: Results

	const injectFilteredElements = (filter: string, results: Results) => {
		popup.innerHTML = ''
		emojiChangeListeners = results.map((result: Result) => {
			const { target: emoji } = result
			const emojiElement = createElementFromHTML(
				createImgTag(emoji)
			) as HTMLImageElement
			const span = document.createElement('span')
			span.innerHTML = `:${fuzzysort.highlight(result, '<span class="fuzzy-highlight">', '</span>')}:`
			span.style.cursor = 'default'
			const div = document.createElement('div') as HTMLDivElement
			div.classList.add('inline-popup-item')
			div.appendChild(emojiElement)
			div.appendChild(span)

			div.addEventListener("click", (event) => {
				emojiSelectedListener(event, `:${filter}`, emoji)
				onClose()
			})

			popup.appendChild(div)

			div.addEventListener("mouseover", event => {
				const title = ((event.target as HTMLDivElement).firstChild as HTMLImageElement)?.title
				if (title)
					emojiChangeListeners.forEach(handlers => {
						handlers.highlightHandler(results.findIndex((result: Result) => result.target === title), false)
					})
			})

			const highlightHandler = (index: number, shouldScroll?: boolean) => {
				if (results.map(r => r.target).indexOf(emoji) == index) {
					div.classList.add('highlighted')
					if (shouldScroll)
						// @ts-ignore (supported by Chrome)
						div.scrollIntoViewIfNeeded(false)
				} else {
					div.classList.remove('highlighted')
				}
				highlightedIndex = index
			}

			return {
				div,
				highlightHandler
			}
		})
	}

	const onOpen = () => {
		popup.style.display = "block"
		// don't cut off the popover in replies
		for (const element of document.getElementsByClassName('ts-message-list-item')) {
			(element as HTMLDivElement).style.overflow = "visible"
		}
	}

	const onClose = () => {
		//emojiChangeListeners.forEach(handlers => { handlers.filterHandler("") })
		popup.style.display = "none"
	}

	const onFilter = (toFilter: string) => {
		fuzzySorted = fuzzysort.go(toFilter, emojiList)
		if (fuzzySorted.total > 0) {
			injectFilteredElements(toFilter, fuzzySorted)
			popup.style.display = "block"
			onHighlight(0)
		} else {
			popup.style.display = "none"
		}
	}

	const onHighlight = (index: number) => {
		emojiChangeListeners.forEach(handlers => { handlers.highlightHandler(index) })
		highlightedIndex = index
		return fuzzySorted[highlightedIndex].target
	}

	const onHighlightNext = () => {
		if (highlightedIndex + 1 <= fuzzySorted.total - 1)
			highlightedIndex++
		else
			highlightedIndex = 0
		emojiChangeListeners.forEach(handlers => { handlers.highlightHandler(highlightedIndex) })
		return fuzzySorted[highlightedIndex].target
	}

	const onHighlightPrevious = () => {
		if (highlightedIndex - 1 >= 0)
			highlightedIndex--
		else
			highlightedIndex = fuzzySorted.total - 1
		emojiChangeListeners.forEach(handlers => { handlers.highlightHandler(highlightedIndex) })
		return fuzzySorted[highlightedIndex].target
	}

	const getHighlightedEmoji = () => {
		return fuzzySorted[highlightedIndex].target
	}

	return {
		element: popup,
		onOpen,
		onClose,
		onFilter,
		onHighlightNext,
		onHighlightPrevious,
		getHighlightedEmoji
	}
}

export const injectInlinePopup = (ckEditor: HTMLDivElement, emojiList: string[]) => {
	const {
		element: inlinePopup,
		onOpen,
		onClose,
		onFilter,
		onHighlightNext,
		onHighlightPrevious,
		getHighlightedEmoji
	} = createInlinePopup(
		emojiList,
		(_: Event | null, commandText: string, emoji: string) => {
			emojifyCommand(ckEditor, commandText, emoji)
		}
	)

	let isOpen = false
	// inject the inline popup as a sibling before the ckEditor component
	if (ckEditor?.parentElement?.querySelector(`.${inlinePopupClassName}`) === null) {
		ckEditor?.parentElement?.insertBefore(inlinePopup, ckEditor)
	}

	const closeIfOpen = () => {
		if (isOpen) {
			onClose()
			isOpen = false
			// Esc closes popup but unfocuses the editor. Bring the focus back!
			ckEditor.focus()
		}
	}

	// TODO: Somehow figure out how to handle Esc closes inline popup but clicking in it does not
	// ckEditor.addEventListener("blur", function() {
	// 	closeIfOpen()
	// })

	ckEditor.addEventListener("click", () => {
		closeIfOpen()
	})

	ckEditor.addEventListener("keydown", e => {
		// TODO: Enter does not submit the form sometimes
		const event = e as KeyboardEvent
		// Submitting form - unemojify commands
		if (event.key === 'Enter' && !isOpen)
			unemojifyInput(ckEditor)
		if ((event.key === 'Tab') && isOpen) {
			const selection = window.getSelection()
			const commandRange = selection?.getRangeAt(0)
			const command = getCommand((commandRange?.commonAncestorContainer as Text).wholeText)
			if (command) {
				e.preventDefault()
				e.stopPropagation()
				emojifyCommand(ckEditor, `:${command}`, getHighlightedEmoji())
				closeIfOpen()
			}
		}
	})

	// put listener on submit button if not already there
	const footerElement = ckEditor.closest('.ts-new-message-footer')
	if (footerElement && !footerElement.getAttribute('emojiSubmitListener')) {
		footerElement.setAttribute('emojiSubmitListener', 'true')
		const extensionIconsContainerElement = footerElement.nextElementSibling
		if (extensionIconsContainerElement) {
			const button = extensionIconsContainerElement.querySelector('.icons-send.inset-border')
			if (button) {
				button.addEventListener('mousedown', () => {
					unemojifyInput(ckEditor)
				})
			}
		}
	}

	ckEditor.addEventListener("keyup", (e: Event) => {
		const selection = window.getSelection()
		const commandRange = selection?.getRangeAt(0)

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
				emojifyCommand(ckEditor, `:${command}:`, command)
			}
		}

		inlinePopup.style.top = `-${inlinePopup.clientHeight}px`
	})
}
