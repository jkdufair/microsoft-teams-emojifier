// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH

/**
 * Replace the partially or fully entered emoji command (colon plus an emoji name) with an img tag
 * to the emoji server
 *
 * @param ckEditor - the element the user has typed into
 * @param commandText - the command (possibly incomplete) they have typed (i.e. :arn or :arnold)
 * @param emojiCommand - the name of the emoji to use in the img tag
 */
export const emojifyCommand = (ckEditor: HTMLDivElement, commandText: string | null, emojiCommand: string) => {
	ckEditor?.parentNode?.normalize()
	ckEditor.focus()
	let selection = window.getSelection()
	let commandRange = selection?.getRangeAt(0)

	if (commandRange) {
		// delete any part of command that was typed (i.e. :lun or :lunch)
		if (selection && selection.anchorNode && commandText) {
			const caretPosition = commandRange.endOffset
			commandRange.setStart(selection.anchorNode, caretPosition - commandText.length)
			commandRange.setEnd(selection.anchorNode, caretPosition)
			commandRange.deleteContents()
		}

		// insert img tag for emoji
		const emojiImage = createImgTag(emojiCommand.replaceAll(':', ''))
		commandRange.insertNode(emojiImage)

		// Put cursor after emoji
		commandRange.collapse()
	}
}

/**
 * Return an HTMLImageElement for an img tag (lazy loaded) for a given emoji.
 * @param emoji - the name of the emoji
 * @param shouldBeSquare - whether to render the img tag with the "square" class that will force the emoji into a square
 */
export const createImgTag = (emoji: string, shouldBeSquare = false) => {
	const imgTag = document.createElement('img')
	imgTag.classList.add('emoji-img')
	if (shouldBeSquare)
		imgTag.classList.add('square')
	imgTag.setAttribute('src', `${emojiApiPath}/emoji/${emoji}`)
	imgTag.setAttribute('title', emoji)
	imgTag.setAttribute('loading', 'lazy')
	return imgTag
}
