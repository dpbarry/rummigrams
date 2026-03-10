WIP

## Multiplayer (PartyKit)

1. **Install & deploy**
   ```bash
   npm install
   npx partykit deploy
   ```
   After GitHub login you’ll get a URL like `https://rummigrams.YOURUSERNAME.partykit.dev`. Copy it.

2. **Wire the client**  
   In `js/party.js`, set `PARTYKIT_URL` to your deployed URL (replace `YOURUSERNAME`):
   ```js
   const PARTYKIT_URL = "wss://rummigrams.YOURUSERNAME.partykit.dev";
   ```

3. **Play**  
   - **Create room:** Home → “Create Room” → share the URL (e.g. `yoursite.github.io/?room=abc123#game.html`).  
   - **Join:** Open that link; you’ll join the same room. First to complete a valid board wins.
