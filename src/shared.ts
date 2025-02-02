// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH
export const MESSAGE_LIST_ITEM_CLASS = 'ts-message-list-item'
export const CKEDITOR_CLASS = 'cke_wysiwyg_div'

export const textNodeAtCursor = () => {
	const selection = window.getSelection()
  	if (!selection) return undefined
	const anchorNode = selection.anchorNode
	if (!anchorNode) return undefined

	let node: Text | undefined = undefined
	if (anchorNode.nodeType === Node.TEXT_NODE) {
		node = anchorNode as Text
	}
	if (anchorNode.nodeType === Node.ELEMENT_NODE) {
    const firstNonEmptyTextNode = [...anchorNode.childNodes].find((n: Node) =>
			n.nodeType === Node.TEXT_NODE && (n as Text).wholeText !== '') as Text
    node = firstNonEmptyTextNode
	}
	return node
}

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

		const spaceNode = document.createTextNode('\u00A0')
		commandRange.insertNode(spaceNode)

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
