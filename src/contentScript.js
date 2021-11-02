chrome.storage.sync.get("api-url", data => {
	const s1 = document.createElement('script');
	s1.type = 'text/javascript'
	s1.text = `const EMOJI_API_PATH = '${data["api-url"]}'`;

	const s2 = document.createElement('script');
	s2.src = chrome.runtime.getURL('emojifier.js');
	s2.onload = function() {
    this.remove();
	};
	(document.head || document.documentElement).appendChild(s1);
	(document.head || document.documentElement).appendChild(s2);	
})
