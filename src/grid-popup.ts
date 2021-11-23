import { CKEDITOR_CLASS, createImgTag, emojifyCommand, MESSAGE_LIST_ITEM_CLASS } from './shared'

const NEW_MESSAGE_CLASS = 'ts-new-message'

/**
 * Create the element that handles filtering the emojis in the grid popup.
 * @param onFilterChange - the function to execute when the filter text has changed
 * @param debounce - number of milliseconds to delay when filter text has changed before executing onFilterChange
 * @param onEmojiSelected - the function to execute when the emoji is chosen
 */
const generateFilterBox = (onFilterChange: { (newFilter: string): void },
	debounce: number | undefined,
	onEmojiSelected: { (selectedFilter: string): void }) => {
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
			onEmojiSelected(inputBox.value)
		}
	})

	const inputBoxContainer = document.createElement("div")
	inputBoxContainer.id = "emoji-input-box-container"
	inputBoxContainer.appendChild(inputBox)
	return inputBoxContainer
}

/**
 * Create the element that displays and handles the emoji grid popup.
 * @param emojis - the list of emoji names
 * @param emojiSelectedListener - the function to execute when the emoji is chosen
 * @param closeListener - the function to execute when the popover is closed
 */ 
const createEmojiGrid = (emojis: string[],
	emojiSelectedListener: { (event: Event | null, emoji: string): void },
	closeListener: { (event: Event | undefined): void }) => {
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
			var emoji = emojis.find((emoji) => emoji.includes(selectedFilter))
			if (emoji)
				emojiSelectedListener(null, emoji)
			onClose()
		}
	)
	emojiFilterChangeListeners = emojis.map((emoji) => {
		const emojiElement = createImgTag(emoji, true)
		if (emojiElement) {
			emojiElement.addEventListener("click", (event) => {
				emojiSelectedListener(event, emoji)
				onClose(event)
			})
			table.appendChild(emojiElement)
			return (newFilter: string) => {
				emojiElement.style.display = emoji.includes(newFilter)
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

/**
 * Add the grid popover button and child elements to the DOM with listeners.
 * @param existingPreviewButton - Teams' emoji grid popover button :eww:
 * @param emojis - the list of emoji names
 */
export const injectGridPopoverButton = (existingPreviewButton: Element, emojis: string[]) => {
	// Clone the control to disconnect all event listeners
	var emojiCloned = existingPreviewButton.cloneNode(true)
	var buttonContainer = existingPreviewButton.parentNode
	if (buttonContainer)
		buttonContainer.replaceChild(emojiCloned, existingPreviewButton)

	var open = false
	var {
		element: emojiTable,
		onOpen,
		onClose,
	} = createEmojiGrid(
		emojis,
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
