# Chain Reaction

A live multiplayer word chain game for team sessions. The host runs the game on a big screen, and players follow along, buzz in and play power cards from their phones.

## Deploy on Render (free)

1. Create a new GitHub repository and upload everything in this folder.
2. Go to https://dashboard.render.com and choose **New → Web Service**.
3. Connect your GitHub repository.
4. Use these settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
5. Click **Create Web Service**. After a minute or two you get a link like `https://chain-reaction-xxxx.onrender.com`. Share that link with your team.

Alternatively, choose **New → Blueprint** and point it at the repository. The included `render.yaml` fills in all the settings for you.

Free Render services go to sleep when nobody has used them for a while, and the first visit after that can take about a minute to wake up. Open the link a few minutes before your session starts.

## Run it on your own computer

```
npm install
npm start
```

Then open http://localhost:3000. Phones on the same Wi-Fi can join with your computer's local IP address, for example `http://192.168.1.20:3000`.

## On game day

1. The host opens the link on the laptop connected to the projector, adds the players and starts the game.
2. Tap **📱 Phone join code** to show a QR code. Players scan it and tap their name.
3. One person can join as **Chain Keeper** to see the hidden words on their phone and check each recital.

## How it works

- `public/index.html` is the whole game: screens, scoring, timers, sounds and the phone view.
- `server.js` serves the page and relays live updates between the host screen and phones over WebSockets.
- The game state is saved in the host's browser, so a page refresh doesn't lose the game. The server stores nothing.
