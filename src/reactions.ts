// - Add grid popover button to message-actions-popover container for each message and reply via observers
//   - Keyboard shortcuts if possible
// - When emoji selected in grid popover, find the reactions reply
//   - If exists, parse and add reaction
//   - Otherwise, create new reply (with text display:none)
// - Save via XMLHttpRequest
// - Add clickable reactions (and a "smiley plus" icon with a grid popover) from each reactions reply to messages
// PROFIT

import { injectGridPopupButton } from "./grid-popup"

/*
{ "reactions": [
	{
		"messageID": "0123456789",
		"imdisplayname": "Dufair, Jason K.",
		"emoji": "teams-dumpsterfire"
	},
	...
]}
*/

// @ts-ignore defined via injection in contentScript.js
const emojiApiPath = EMOJI_API_PATH

/** The container of the emoji grid popup button */
let popoverContainer: Element
/** The message that was hovered over when the emoji grid popup button was clicked */
let messageBody: Element

/**
 * The handler for when the emoji grid popup button is clicked
 */
function emojiPopupButtonClickHandler() {
	console.log('teamoji messageBody: ', messageBody)
	console.log('teamoji reaction button clicked')
	injectGridPopupButton(reactionButton, popoverContainer, emojiSelected, false, true)
}

const reactionImg = document.createElement('img')
reactionImg.setAttribute('src', `${emojiApiPath}/emoji/teams-dumpster-fire`)
reactionImg.classList.add('emoji-reaction-button')

const reactionButton = document.createElement('button')
reactionButton.type = 'button'
reactionButton.setAttribute('role', 'button')
reactionButton.classList.add('ts-sym')
reactionButton.classList.add('icons-emoji')
reactionButton.classList.add('app-icons-fill-focus')
reactionButton.appendChild(reactionImg)
reactionButton.addEventListener('click', emojiPopupButtonClickHandler)

const reactionListItem = document.createElement('li')
reactionListItem.appendChild(reactionButton)

const findReactionsReply = (event: Event) => {

}

const emojiSelected = (event: Event | null, emoji: string) => {
	console.log('teamoji emoji selected: ', emoji)
	if (!event) return
	const reactionsReply = findReactionsReply(event)
}

/**
 * Add the emoji grid popup button to the popover container when the message body is hovered over.
 * Also remove the existing reactions buttons.  Because they are ugly, corporate, and :stupit:
 */
export const addReactionHover = (messageBodies: NodeListOf<Element>) => {
	[...messageBodies].forEach((mb) => {
		mb.addEventListener('mouseenter', () => {
			messageBody = mb
			const observer = new MutationObserver((mutationRecords: MutationRecord[]) => {
				mutationRecords.forEach((mr): void => {
					mr.addedNodes.forEach((node): void => {
						if (node.nodeName === 'DIV' && (node as HTMLDivElement).classList.contains('message-actions-popover-container')) {
							popoverContainer = (node as Element)
							const ulNode = (node as Element).getElementsByTagName('UL')[0]
							ulNode.childNodes.forEach(childNode => {
								if ((childNode as HTMLLIElement).classList?.contains('message-emoji-reaction')) {
									ulNode.removeChild(childNode)
								}
							})
							ulNode.prepend(reactionListItem)
						}
					})
				})
			})
			observer.observe(document.body, { childList: true })
		})
	})
}
