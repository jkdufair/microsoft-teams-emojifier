// - Add grid popover button to message-actions-popover container for each message and reply via observers
//   - Keyboard shortcuts if possible
// - Add clickable reactions (and a "smiley plus" icon with a grid popover) from each reactions reply to messages
// - When emoji selected in grid popover, find the reactions reply
//   - If exists, parse and add reaction
//   - Otherwise, create new reply (with text display:none)
// - Save via XMLHttpRequest
// PROFIT

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
