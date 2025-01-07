
<!--
medium.com subscription needed

	How to install Open WebUI without Docker
	https://bhavikjikadara.medium.com/how-to-install-open-webui-without-docker-33eedbda9b96
-->


<!--
- [Observable Data Commons](/data-commons/) - [Open WebUI](location/) - [Storyboard Generator](/data-pipeline/research) - [Moonshots](/community/projects/)
-->

<!--
**Timely Projects**

- [Activate Ollama on a different server](https://docs.openwebui.com/) for use with our [Docker Setup](/projects/location/setup/docker/)


	Full-Stack Cloudflare SaaS kit
	https://github.com/Dhravya/cloudflare-saas-stack


Create a developer account in [Omdena.com](https://omdena.com) and help us create [team panels](/panels) using the 

- [Document adding Flask as our optional python webroot](../localsite/start/steps/)
-->

# Active Projects

Our weekly meetups are every [Thursday at 7pm ET](/io/coders/).

Select one of the 7 project areas below and add your first name below by editing a [fork of the projects repo](https://github.com/ModelEarth/projects/blob/main/active.md), then send a PR.

**Active OPT Volunteers:** If you're participacting as an OPT grad, please contribute at least one Pull Request (PR) per week to remain active.  

Please actively update README files. Add status updates and deployment steps, correct existing notes. Send Loren an email whenever you send a pull request. If you are uncertain about an edit, make your best guess and email Loren AFTER you submit the PR.

[Fork and clone related repos](../localsite/start/steps/) - When writing Loren, include a review link. Your review link will be: [youraccount].github.io/[therepo] once you've turned on Github Pages for your both your fork of the repo and for your fork of the [localsite repo](https://github.com/modelearth/localsite/).

You can [edit the current page](https://github.com/ModelEarth/projects/blob/main/active.md) to add your first name by the projects below, and add details for new updates. Submit a PR and write Loren.


## 1. Javascript Data Visualization (Everybody's Home Page)

Our [Everybody's Home Page](../home) process is being designed to display infinite content based on parameters.

IN PROGRESS: [Javascript Timelines from Google Data Commons API](/data-commons/docs/data/) - Priyanka, Mehul <!--Aishwrya, Vishnupriya-->

TO DO: Update our existing [address auto-lookup](../home/) to set state=NY etc. in the URL hash. (Currently visible on [localhost only](http://localhost:8887/home/).)

We're pulling images and video via [our FeedPlayer](https://model.earth/feed) which can be pointed at a Github repo or any API.

<!--
**More Data Commons Visualization Projects**
[Observable with Data Commons](/data-commons/) - [Data Loaders How-To](/data-commons/dist/air/)

[Python CoLabs for GDC timeline automation - Air and Climate](/data-commons/dist/air)

[Kargil's notes](https://github.com/modelearth/Observables-DataLoader/tree/master/docs)

[Observable Framework Dashboard for UN Goals](https://observablehq.com/framework/) - with our .csv timelines and DuckDB Parquet impact files

TO DO: [Hosting DataCommons locally with Flask](/localsite/info/data/datacommons) - Vishnupriya and our GDC team
-->

## 2. Ai Javascript with LLM APIs (Planet repo)

TO DO: Add a field called #gitrepo on our [home repo dev page](../home/repo) for pasting a Github account and repo name. Include an alert if the URL does not contain github.com (or another git provider), an account and a repo name.  

TO DO: Add javascript to our [Planet repo](https://github.com/modelearth/planet/) that uses [Langchain's Chat Model Interface](https://python.langchain.com/docs/concepts/chat_models/), send a page from any GitHUb repo to an AI API like OpenAI to provide Retrieval Augmented Generation (RAG) using [LangChain.js](https://api.js.langchain.com) javascript. -- Dhananjay

Integrate [our API storage in javascript](/localsite/tools/storage/api/) to store API keys locally. -- Dhananjay

<!--See also: DataStax Astra DB-->

**Python Retrieval Augmented Generation (RAG)**

TO DO: Move Python Langchain into main branch in [Our Python Langchain Repo](https://github.com/modelearth/langchain/) <!--Dhananjay and Pranathi  -->

[Conversational RAG for 10 LLMs](https://python.langchain.com/docs/tutorials/qa_chat_history/) - Pradeep and Pranoy  

Pradeep: Pinecone on AWS free 2 GB max
Pranoy: DocArray in memory Vecto Store (database)

We can also [remove LangChain to simplify](https://www.octomind.dev/blog/why-we-no-longer-use-langchain-for-building-our-ai-agents)

Content prep for RAG: [Innovations in Water Purification](/evaporation-kits/innovations/) - Hyper Desalination

**Retrieval-Interleaved Generation (RIG)**  
Using [Google Data Commons DataGemma AI](https://ai.google.dev/gemma/docs/datagemma) - For RIG, Zihan found that a paid Google plan was needed to avoid storage/memory errors/timeouts. Here's our [RIG CoLab](https://colab.research.google.com/drive/1eLtHOR6e3lAUVijUJ56VMaiTU6hA9enc?usp=sharing).


### OpenWebUI LLM Location Data

Our [Open WebUI for Locations](location/) experimental efforts aimed at [Retrieval Augmented Generation (RAG)](https://docs.openwebui.com/features/rag/) for "context window" recency.<!-- Next: Text to Action / Nividia Kuda is their advantage = code library that interacts with chip -->

Our work toward running [OpenWebUI with an External Ollama Pipeline](/projects/location/setup/customize/)  
uses our Customize.py script to remove local use of Ollama.  
And our Sync.py script to add-back Ollama to sync with the [OpenWebUI parent repo](https://github.com/open-webui/open-webui).

TO DO: [Add localsite.js to OpenWebUI](/projects/location/) - Use our [Building Branches Locally](/projects/location/setup/) techniques within our [Datascape fork](https://github.com/datascape/open-webui/actions)

### Earthscape NextJS Chatbot UI fork

Our [Earthscape fork of Chatbot UI](/earthscape/app/) - React, Supabase and [NextJS Hosting using GitHub Pages](https://www.freecodecamp.org/news/how-to-deploy-next-js-app-to-github-pages/)


### Storyboard Generator

Images and Videos from .CSV prompts 
for Interactive presentation backgrounds, Request Visualization

- [Ai Request Visualization](/requests/) - for Storyboards, Meal Planning and Project Visualization  
- [Music for Data Science](https://github.com/DreamStudioCode/music) - for [home/repo](/home/repo)

- [Image Gallery (JQuery) and Video (Leonardo)](/data-pipeline/research/stream)
- [Our Storyboard Generator](/data-pipeline/research/)
- [Open Webui image generation](https://docs.openwebui.com/tutorial/images/) - Integrate our image .csv process
  <!-- [Kishor's Repo](https://github.com/mannurkishorreddy/streamlit-replicate-img-app)-->
  <!--- [Image Gallery (React)](/react-gallery/view/) - Anthony -->

[Google Notebook LM](https://notebooklm.google)


## 3. RealityStream ML - Server-Side Python

[Run Models Colab](/RealityStream/)

TO DO: Send URL hash # parameters to our [Run Models CoLab](/RealityStream) using a [webhook on Google Cloud (ChatGPT)](https://chatgpt.com/share/670e7002-85fc-8003-a466-9b682012f3ea)

<!--
**Anvil with our CoLabs:**
[Anvil Extras](https://anvil-extras.readthedocs.io/en/latest/guides/index.html) and [Anvil](https://anvil.works/learn/tutorials/data-science#connecting-notebooks) and [AnvilScope CoLab](https://colab.research.google.com/drive/1rlOPfOxRnfm4pTGSn3gk_MvmVF65iidF?usp=sharing) using Plotly - Soham
-->

<!--
- [StreamLit hosting within Open WebUI](https://github.com/streamlit/streamlit/issues/969)
-->


- [RealityStream](/RealityStream/) - Machine Learning Classification Models - TO DO
- [Process Industry NAICS by Zip Code](/community-zipcodes/mail) - DONE Yunbo
- [ML for Community Forecasting Timelines](../data-pipeline/timelines/) - Zip code pipeline - TO DO
- [Open Data Panels - YAML Display](/OpenFootprint) - Microsoft Plug and Play - TO DO

- [Top Commodities by State (hide sort columns)](/data-pipeline/research/economy) - Dinesh
- [State Regions using Sets of Counties](/community-data/us/edd/) - Dinesh
- [USEEIO matrix files with clustering](/machine-learning/python/cluster/) - <!--Honglin-->Rupesh

<!--
- [CrewAI+Ollama integration](https://lightning.ai/lightning-ai/studios/ai-agents-powered-by-crewai) within our [Open WebUI fork](location)
- [Flowsa RStudio - API to JSON](/localsite/info/data/flowsa/)
-->

- [Update Farm Fresh Data pull](/community-data/process/python/farmfresh/) - Bhavna - DONE
- [Push EPA date to Google Data Commons API](https://docs.datacommons.org/api/)


## 4. International Trade Flow - Python, SQL, Javascript

TO DO: Processing Exiobase in CoLabs, displaying with javascript

Contributors: Gary, Satya, Himanshu, Sahil

[International Trade Flow SQL Data Prep](/OpenFootprint/trade) - Exiobase Colab and charts

[Our little trade flow Sankey](/OpenFootprint/trade/) - [Big Sankey](https://sankey.theshiftproject.org/) - [Our Fork with python 3.10](https://github.com/ModelEarth/Mapping-global-ghg-emissions) and [bug resolved](https://github.com/baptiste-an/Mapping-global-ghg-emissions/issues/2)

TO DO: [Chord Chart Data Prep](/io/charts/chord/) <!-- Poorna and everyone interested -->

TO DO: [Python to pull Harmonized Code (HS) lookups into Supabase](/OpenFootprint/harmonized-system/) - Initial work by Wenjie (and Chen)

TO DO: [Sankey Industry eChart](/OpenFootprint/charts/echarts/sankey-nodeAlign-left.html) - eCharts uses a common echarts.min.js file which we'll load in [Feed Viewer](/feed/view)

TO DO: [Python - Finalize our All the Places data by State and Zip](/places)

#### Exiobase and Flask

For our [International Trade Flow](/openfootprint/trade/) we can integrate our [Exiobase-Global-Trade GitHub Repo](https://github.com/modelearth/exiobase-global-trade) and a new [Comtrade API pull](https://github.com/ModelEarth/exiobase-global-trade/tree/main/comtrade)

#### US EPA State Impacts

TO DO: Pull into SQL DuckDB

[Javascript updates for US EPA impact reports](/useeio.js/footprint/)  
[React Team - Mosaic column checkboxes](/io/charts)  
[React Team - Commodity Totals](/localsite/info/data/totals/) in [Jobs Reports](/localsite/info/#indicators=JOBS)
[Impact Label Pipeline](/apps/impact) - Starting point for duplicating US EPA RStudio in python


## 5. BuildingTransparency.org API - Open Footprint Interactive Labels

[Open Footprints](/food/) - [Product Impact API](/OpenFootprint/products/), Add javascript tp [Feed View](/feed/view/)  

[Food Nutrition Labels](/data-commons/docs/food) - Shali and Wenwei (Stella)

**BuildingTransparency and Open Footprint labels**

Bhavna, Yash

- [Use our state map filter](#geoview=country) with colors for [new USEEIO reporting maps](https://figshare.com/collections/USEEIO_State_Models_v1_0_-_Supporting_Figures/7041473)
- [BuildingTransparency - Product Impact Profiles by State and Zip](/io/template/feed/) - TO DO <!--Ronan-->
- [BuildingTransparency - API Aggregates of States and Countries](/io/template/product/) - Initially Luwei
- [BuildingTransparency - JSON file pull for impact templates](/io/template/product/)



## 6. Feed Player React - Embeddable Viewer for Images and Video

- [Discord API](https://discord.com/developers/docs/intro) - Our Team list is pulled from Discord into our [Feed Player](https://model.earth/feed/) 

- [Feed Player](../feed/dist) - Video and Images from API feeds and Google Sheet lists
- [NASA Feed Viewer](../feed/view/#feed=nasa) - JSON, YAML, CSS, RSS - [Address Lookup](/feed/view/#feed=311)
- [Feed Player Visuals initially](/feed/dist/) - Restore display of BigBunny images and video, or show NASA images.

<!--
- [Add Datawrapper.de](https://www.datawrapper.de/) using "link external dataset"

- [Pull from Supabase (or backup file) into databricks SQL](https://chatgpt.com/share/d610d3e6-ce5f-4e7f-ba9e-4c74ec23abd4) - Apurva, Soham
- [View DuckDB from Javascript](/OpenFootprint/prep/sql/duckdb/) - Kelly, Gary
-->



<!--
- [Datausa.io](https://datausa.io) - Add API and embeddable visualizations to Feed Player
- [Restack.io](https://www.restack.io/docs/supabase-knowledge-supabase-rust-sdk-guide) - for Supabase with Rust and Streamlit


openai
Docker path: https://chat.openai.com/share/61b0997f-ea9b-49f7-9bcb-12fa0519a2d1

Matthew Berman list of true Agents:
https://youtu.be/_AOA6M9Ta2I?si=Bh8SMhyD3GmuCLks&t=378


CSV Files to use for Timelines, Observable, and AI Training at: [industries/naics/US/counties](https://github.com/ModelEarth/community-data/tree/master/industries/naics/US/counties)
Pre-processed data for county industry levels, based on employment, establishments and payroll.-->


<!-- 
- Odoo on Google Cloud for [Modules and Templates](https://www.odoo.com/documentation/master/developer/tutorials/website.html) and [Owl](https://www.cybrosys.com/blog/an-overview-of-the-owl-component-lifecycle) with the [Owl Github repo](https://github.com/odoo/owl)
-->


## 7. Moonshot Challenges

Our most challenging projects - [Take the leap](/community/projects/)
<br>

<div id="activeDivLoaded"></div>
