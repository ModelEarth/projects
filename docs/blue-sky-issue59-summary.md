# Issue #59 — BlueSky Image Fetch Issue (Summary)

## Overview
Images from linked websites in the BlueSky feed are not loading in the current implementation. This document summarizes the observed behavior, possible causes, and next steps.
## Current Behavior
- Posts in the BlueSky feed show link text, but images do not load.
- Some URLs fail to fetch image metadata.
- No errors are logged in several cases, making the issue harder to trace.

## Possible Causes
1. **CORS restrictions**  
   The hosting websites may prevent cross-origin image fetching.

2. **Missing headers in the fetch request**  
   Some image servers require specific headers.

3. **Parsing issue**  
   Thumbnail or OG:image tags may not be parsed correctly.

4. **Timeouts or blocked requests**  
   External sites may rate limit or block bots.

## Recommended Next Steps
- Add debugging logs to trace failed image fetch attempts.
- Test multiple websites to compare behavior.
- Verify fetch request headers and user-agent.
- Consider proxying image requests via server-side with CORS enabled.
- Review Rust backend for image-loading logic.

This file provides a clean version of the observations and next steps for Issue #59.
