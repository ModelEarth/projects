# Notes on BlueSky Image Fetch Issue (Issue #59)

### Summary
Images from linked websites in the BlueSky feed are currently not visible in the 
ModelEarth interface. This appears to be related to the Rust CORS passthrough not 
returning image data correctly.

### Current Behavior
- BlueSky feed loads text content correctly.
- Image URLs appear in the data but images do not display.
- Heroku-based service shows images, but local Rust API does not.

### Possible Causes
- CORS headers missing or blocked
- Rust server not forwarding image blobs
- Fetch requests failing silently
- JS not receiving image content

### Debugging Notes
`console.log("Fetching BlueSky image:", imageUrl);` confirms the correct URLs 
are being requested.

### Next Steps
- Check Rust server logs
- Compare Heroku vs Local server responses
- Review CORS configuration

