// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH

/**
 * Replace the partially or fully entered emoji command (colon plus an emoji name) with an img tag
 * to the emoji server
 *
 * @param ckEditor - the element the user has typed into
 * @param commandText - the command (possibly incomplete) they have typed (i.e. :arn or :arnold)
 * @param emoji - the name of the emoji to use in the img tag
 */
export const emojifyCommand = (ckEditor: HTMLDivElement, commandText: string | null, emoji: string) => {
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
		const emojiImage = document.createElement('img')
		emojiImage.classList.add('emoji-img')
		emojiImage.src = `${emojiApiPath}/emoji/${emoji.replaceAll(':', '')}`
		commandRange.insertNode(emojiImage)

		// Put cursor after emoji
		commandRange.collapse()
	}
}

export const createElementFromHTML = (htmlString: string) => {
	var div = document.createElement("div")
	div.innerHTML = htmlString.trim()
	return div.firstChild
}

export const createImgTag = (emoticonName: string) => {
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
