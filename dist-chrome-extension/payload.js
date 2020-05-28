//Make sure the payload is injected only once per context at most
if (window.SECRET_EMOJI_KEY != 'set') {
    window.SECRET_EMOJI_KEY = 'set';
    if (window.EMOJI_API) {
        // if this is an injection into the electron app
        console.log("EMOJI API SET:" + window.EMOJI_API);
        inject(window.EMOJI_API, window);
    } else if (window.chrome && window.chrome.storage) {
        function breakIntoTopPageScope(javascriptString) {
            const script = document.createElement('script');
            script.setAttribute('type', 'text/javascript');
            script.innerHTML = javascriptString;

            const header = document.getElementsByTagName('head')[0];
            header.appendChild(script);
        }
        // if we are in the chrome extension
        chrome.storage.sync.get('api-url', (data) => {
            setTimeout(() => {
                const EMOJI_URL = data['api-url'];
                //we need to break into the top-level scope to make use of the JQuery-lite utility that already exists in ms-teams
                breakIntoTopPageScope(inject.toString() + ";inject('" + EMOJI_URL + "');");
            },
                1000);
        });
    }
}

function inject(emojiApiPath) {

    function getValidEmojis() {
        return new Promise((resolve, reject) => {
            $.get(
                emojiApiPath + '/emoticons',
                (result) => {
                    resolve(result);
                });
        });
    }

    function getMessageContentList() {
        return $('.message-body-content > div:not(.' + emojiClass + ')').toArray();
    }

    function createImgTag(emoticonName) {
        return '<img class="emoji-img" src="'+emojiApiPath+'/emoticon/'+emoticonName+'" title="'+emoticonName+'">';
    }
    
    function createElementFromHTML(htmlString) {
        var div = document.createElement('div');
        div.innerHTML = htmlString.trim();
        return div.firstChild; 
      }

    var emojiMatch = /:([\w-]+):/g;
    function injectEmojiImages(inputText, validEmojis) {
        var resultStr = "";
        var matches = inputText.matchAll(emojiMatch);
        var currentIndexInInput = 0;

        var match;
        while (!(match = matches.next()).done) {
            var reInjectText = match.value[0];
            if (validEmojis.indexOf(match.value[1]) != -1) {
                reInjectText = createImgTag(match.value[1]);
            }

            resultStr += inputText.substring(currentIndexInInput, match.value.index);
            resultStr += reInjectText;
            currentIndexInInput = match.value.index + match.value[0].length;
        }
        resultStr += inputText.substring(currentIndexInInput, inputText.length);
        if (!resultStr.endsWith('&nbsp;')) {
            //a characer of some sort is requred to get emoji at the end of a message to display correctly
            // don't ask me why
            // also don't ask me why it's not needed anymore
            // resultStr += '&nbsp;';
        }
        return resultStr;
    }

    var emojiClass = 'EMOJIFIER-CHECKED';

    function emojifyMessageDiv(div, validEmojis) {
        div.innerHTML = injectEmojiImages(div.innerHTML, validEmojis);
        div.classList.add(emojiClass);
    }

    function typeInInput(text){
        const editorWindow = document.getElementsByClassName('ts-edit-box').item(0);
        const textContainer = editorWindow.getElementsByClassName('cke_editable').item(0).firstElementChild;
        if(textContainer.innerHTML.contains('br')){
            textContainer.innerHTML = '';
        }
        textContainer.innerText = textContainer.innerText + text;
    }

    function generateCloseHeader(closeListener){
        const closeHeader = document.createElement('div');
        closeHeader.style.textAlign = 'end';
        const closeOption = document.createElement('span');
        closeOption.innerText = 'Close';
        closeOption.style.fontSize = '1.2em';
        closeOption.style.fontWeight = '700';
        closeOption.style.cursor = 'pointer';
        closeOption.addEventListener('click', (event) => {
            closeListener(event);
        });
        closeHeader.appendChild(closeOption);
        return closeHeader;
    }

    function generateFilterBox(onFilterChange, debounce, onFilterSelected){
        const inputBox = document.createElement('input');
        let lastTimeout = 0;

        inputBox.addEventListener('input', event => {
            window.clearTimeout(lastTimeout);
            lastTimeout = window.setTimeout(() => {
                var filterValue = inputBox.value;
                onFilterChange(filterValue);
            }, debounce);
        });

        inputBox.addEventListener('keydown', event => {
            if(event.key === 'Enter'){
                onFilterSelected(inputBox.value);
            }
        });

        return inputBox;
    }

    function generateEmojiImgList(emojiList){
        return emojiList.map(emoji => {
            const emojiElement = createElementFromHTML(createImgTag(emoji));
            emojiElement.addEventListener('click', (event) => {
                emojiClickListener(event, emoji);
                onClose(event);
            });
            return emojiElement;
        });
    }

    function filterEmoji(emojiName, filterText){
        return emojiName.contains(filterText);
    }

    function createEmojiGrid(emojiList, emojiSelectedListener, closeListener) {
        const table = document.createElement('div');
        table.classList = 'emoji-flex-table';

        let emojiFilterChangeListeners = [];
        const onClose = (event) => {
            filterBox.value = '';
            emojiFilterChangeListeners.forEach(onchange => onchange(''));
            closeListener(event);
        };
        const filterBox = generateFilterBox(newFilter => {
            emojiFilterChangeListeners.forEach(onchange => onchange(newFilter));
            
            table.scrollTop = table.scrollHeight;
        }, 500, selectedFilter => {
            var emoji = emojiList.find(emoji => emoji.contains(selectedFilter));
            emojiSelectedListener(null, emoji);
            onClose();
        });
        emojiFilterChangeListeners = emojiList.map(emoji => {
            const emojiElement = createElementFromHTML(createImgTag(emoji));
            emojiElement.addEventListener('click', (event) => {
                emojiSelectedListener(event, emoji);
                onClose(event);
            });
            table.appendChild(emojiElement);
            return (newFilter) => {
                emojiElement.style.display = filterEmoji(emoji, newFilter) ? 'block' : 'none';
            };
        });

        const outputT = document.createElement('div');
        outputT.className = 'emoji-popup';
        outputT.appendChild(table);
        outputT.appendChild(filterBox);
        outputT.appendChild(generateCloseHeader(onClose));
        const onOpen = () => {
            outputT.style.display = 'block';
            table.scrollTop = table.scrollHeight;
            filterBox.focus();
        };
        return {
            element: outputT,
            onOpen,
            onClose
        };
    }

    function getEmojiPreviewButtonList() {
        return $('input-extension-emoji > button:not(.' + emojiClass + ')').toArray();
    }
    
    function injectPreviewButtons(emojiList){
        var emojiButtons = getEmojiPreviewButtonList();
        emojiButtons.forEach(button => {
            injectPreviewButton(button, emojiList);
        });
    }

    function injectPreviewButton(previousPreviewButton, emojiList) {
        previousPreviewButton.classList.add(emojiClass);
        // Clone the control to disconnect all event listeners
        var emojiCloned = previousPreviewButton.cloneNode(true);
        var buttonContainer = previousPreviewButton.parentNode;
        buttonContainer.replaceChild(emojiCloned, previousPreviewButton);
        
        var open = false;
        var {element: emojiTable, onOpen, onClose} = createEmojiGrid(emojiList, (event, emoji) => {
            typeInInput(':'+emoji+':')
        }, (event) => {
            emojiTable.style.display = 'none';
            open = false;
        });
        buttonContainer.appendChild(emojiTable);

        emojiCloned.addEventListener('click', () => {
            if(open){
                onClose();
                open = false;
            } else {
                onOpen();
                open = true;
            }
        });
    }

    var CssInject = `
.emoji-img {
    height: 2em !important;
    display: inline-block;
    position: static !important;
}
.emoji-popup {
    background: #C8C8C8;
    position: absolute;
    z-index: 1000;
    left: 100px;
    bottom: 30px;
    font-size: 1.4rem;
    display: none;
    color: black; //dark mode makes all text white
}
.emoji-flex-table {
    display: flex;
    flex-flow: row-reverse wrap;
    justify-content: flex-end;
    align-items: flex-end;
    height:200px;
    width: 500px;
    overflow-y: scroll;
}
.emoji-flex-table .emoji-img {
    cursor: pointer;
}
        `;

    function injectCSS(inputCss) {
        var style = document.createElement('style');
        style.innerHTML = inputCss;
        style.setAttribute('style', 'text/css');
        document.getElementsByTagName('HEAD')[0].appendChild(style);
    }

    function init() {
        injectCSS(CssInject);
        console.log("fetching valid emojis from " + emojiApiPath);
        getValidEmojis().then(emojis => {
            console.log(emojis);
            setInterval(
                () => {
                    var messageList = getMessageContentList();
                    messageList.forEach(div => emojifyMessageDiv(div, emojis));
                    injectPreviewButtons(emojis);
                },
                2000
            );
        });
    }

    init();
}