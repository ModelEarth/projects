# MCP Processes for Impact Data Video Training

Model Context Protocol (MCP) servers will use our pre-processed data to drive LLMs for reports and content generation.

Impact pages to present: [US EPA State Impacts](/profile/footprint/), [International Trade Flow](/profile/trade/) charts (Trade Flow Map, Chord and Sankey), [Impact Label Pipeline](/io/template) and [Jobs Reports](/localsite/info/#indicators=JOBS).

TO DO:

- MCP server for impact data - Tools to list sectors and indicators, and to get impacts by state, industry and trade partner from our USEEIO state model and Exiobase trade flow files.
- MCP tool to drive the presentation - Set a page's hash parameters (state, industry, indicator, chart) so an agent can move through each view in order.
- Training scripts - A YAML or CSV list of steps, each with a page view and narration text, which the agent reads and plays.
- Screen capture - Record each step with a browser MCP (Chrome or Playwright) as video clips or GIFs.
- Playback - Load the clips and narration into our [FeedPlayer](/feed/) as a training sequence.
- Narration check - Have the agent compare its narration with the numbers the page displays, and flag any that differ.
- Setup steps - Document adding the MCP servers to webroot for Claude Code, Codex and Gemini CLIs.

Main data sources for the new MCP process:   
1\. Preprocessed Economic Impact Data from US and International trade flow.  
2\. Preprocessed data from Google Data Commons for goal setting.  
(21 goals, at the start of every meeting, with participants choosing their own top goals.)
