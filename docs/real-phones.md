# Checking Shardfall on real phones

Claude checks phones in a pretend phone (a desktop browser shaped like an iPhone). That can't show
heat, real touch, Safari's quirks, the notch, or how fast a real phone's graphics are. A device
cloud lets you open the game on real phones from your own browser, free for open-source projects.

## One-time setup (the owner)

1. Go to BrowserStack's open-source page (browserstack.com, "Open Source" in the menu, "Unlimited
   access for open source") and apply with the GitHub repository
   `dmolloy98-stack-stack/Shardfall_TCG`. They check the project is open source; the repository
   must be public, which it needs to be for GitHub Pages anyway.
2. When it's approved, sign in. Nothing needs installing.

If BrowserStack says no, LambdaTest (now called TestMu AI) has a small free allowance of live
minutes each month, which is enough for a check before a big release.

## A real-phone check (about 15 minutes, before big releases)

In BrowserStack **Live**, pick a phone, open `https://dmolloy98-stack-stack.github.io/Shardfall_TCG/`,
and turn the phone sideways. Suggested phones, one of each kind:
- an iPhone with a notch, Safari (for example iPhone 15)
- an older iPhone, Safari (for example iPhone 12)
- a recent Android, Chrome (for example Samsung Galaxy S23)
- a cheaper Android, Chrome (for example a Galaxy A-series)
- an iPad, Safari

On each one, check:
- [ ] The menu fits, nothing hides behind the notch, the buttons are easy to tap.
- [ ] A Quick Match starts; dragging a card from the hand onto the table works.
- [ ] Attacking works (tap your character, then the enemy).
- [ ] The computer's turn plays out and comes back to you.
- [ ] Settings opens; Heavy effects on and off both look right.
- [ ] Turning the phone upright shows the "turn sideways" message, and back again works.
- [ ] After one visit: switch the phone to aeroplane mode and reload. The game should still open.
- [ ] The text is readable without zooming.
- [ ] Anything odd: take a screenshot in BrowserStack and send it to Claude with the phone's name.

## Later: automatic runs

BrowserStack can also run Claude's screen tests on real phones automatically. Once the account
exists, Claude reads BrowserStack's current instructions from inside the account, then adds the
account's two keys as GitHub secrets (`BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`; the owner
adds them under the repository's Settings, Secrets) and a GitHub run you can start by hand.
