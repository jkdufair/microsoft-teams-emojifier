#!/bin/bash

UNPACKED=./app.unpacked
JS=$UNPACKED/main.bundle.js
ASAR="/Applications/Microsoft Teams.app/Contents/Resources/app.asar"
PAYLOAD=dist/emojifier.js

rm -rf $UNPACKED

#unpack the electron bootstrapper into the local directory
npx asar extract "$ASAR" $UNPACKED

#If we have already been injected, remove the existing code before adding new stuff
#gsed -i '/\/\*\{8\}BEGIN EMOJIINJECT\*\{8\}\//,/\/\*\{8\}END EMOJIINJECT\*\{8\}\//d' $JS

#Inject the emoji payload
#echo "/********BEGIN EMOJIINJECT********/" >> $JS
#echo "app.on('browser-window-created', function (event, bWindow) {bWindow.webContents.executeJavaScript(\`" >> $JS
# this line used to force debgging inside electron
# echo "app.on('browser-window-focus', function (event, bWindow) {bWindow.webContents.openDevTools();debugger;bWindow.webContents.executeJavaScript(\`" >> ./electron.unpacked/browser/chrome-extension.js;


#Inject the source emoji server from an environment variable
#echo "window.EMOJI_API = '"$EMOJI_URL"';" >> $JS
#sed is used here to escape any existing backtick quotes or escape characters. using those style of quotes for now because the payload comes in as multiline
#in the future would be nice to have a minified single-line payload to inject
#gsed 's/\\/\\\\/g' $PAYLOAD | gsed 's/`/\\`/g' >> $JS
#echo "\`)})" >> $JS
#echo "/********END EMOJIINJECT********/" >> $JS

#re-pack the whole app back into the install location
sudo npx asar pack $UNPACKED "$ASAR"
