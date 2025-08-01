<!--
medium.com subscription needed

	How to install Open WebUI without Docker
	https://bhavikjikadara.medium.com/how-to-install-open-webui-without-docker-33eedbda9b96
-->


<!--
Create a developer account in [Omdena.com](https://omdena.com) and help us create [team panels](/panels) using the 

- [Document adding Flask as our optional python webroot](../localsite/start/steps/)

4 Agent projects

1. Google Data Commons Timelines eCharts and US EPA Chord chart Impacts
2. RealityStream ML Forecasting - with 6 standard ML models
3. FeedPlayer, for viewing API feeds, such as NASA images and video
4. NullSchool Maps + NISAR satellite data to visualize earth surface movements
-->

# Active Projects

### Webroots for RAG training and IO Data Pipeline

[CodeChat](../codechat/) - Overview of webroots for developer insights RAG training
[ModelEarth with AnythingLLM](https://model.earth/modelearth/) - Install steps for Claude Code CLI
[MaterialScience webroot](https://model.earth/materialscience/) - International and state tradeflow for Claude Code CLI
[Model.earth Data Pipeline](/data-pipeline/) - Recent notes in Discord

### MemberCommons for Teams

JAM Stack with Rust API and Azure PostgreSQL and Google Sheets  
[Admin Dashboard](../team/admin/) and our [Model Team List](../team/projects#list=modelteam)  
[Fork our teams repo](https://github.com/modelearth/team) and contribute using [Claude Code CLI](https://www.anthropic.com/engineering/claude-code-best-practices) - [Configure your Server](../team/admin/server/)

### RealityStream updates in progress

[Pull features and targets into colab from Google Data Commons](https://github.com/ModelEarth/realitystream/issues/22) - Prathuyusha
RealityStream industry titles in importance report - Abivish
Tree Canopy density as forecasting target - Sai Thanmayi

### Resources

[Full-Stack Cloudflare SaaS kit](https://github.com/Dhravya/cloudflare-saas-stack) - and SuperMemoryAI
<!--Coming soon: Flow Diagrams using [n8n automation](https://n8n.io/) and NextJS-->


## Get Involved!

Our weekly [DreamStudio Earth](https://dreamstudio.com/io/coders/) meetups are every [Thursday at 7pm ET](/io/coders/).

Select one of the 7 project areas below and add your first name below by editing a [fork of the projects repo](https://github.com/ModelEarth/projects/blob/main/active.md), then send a PR.

[OPT Volunteers Welcome!](../community/members/welcome) - Overview and New Member Signup

**Current Challenges**
Consider focusing on one of the following:

1. [Complete Flask+Colab install script](/cloud/run/)
2. [Test install of Apache & PHP in our SuiteCRM .sh script](/profile/crm/)
3. [Add python to RealityStream for Google Data Commons DCIDs](/realitystream/)
4. [Finish converting LanchainJS to static site](/planet/langchain/)
5. [UX with our Azure backend and Rust API](/profile/crm) - [Admin Dashboard](/team/admin/)
<!--
https://techcommunity.microsoft.com/blog/aiplatformblog/the-future-of-ai-how-lovable-dev-and-azure-openai-accelerate-apps-that-change-li/4413375

5. [React FeedPlayer]() - 
6. [Products Repo](/products)
-->

## 1. Javascript Data Visualization (JS)

Our [Everybody's Home Page](../home) process is being designed to display infinite content based on parameters.

IN PROGRESS: [Javascript Timelines from Google Data Commons API](/data-commons/docs/data/) - Everyone, Priyanka, Niranjan, Kirthika<!--Mehul, Aishwrya, Vishnupriya-->

We're pulling images and video via [our FeedPlayer](../feed) which can be pointed at a Github repo or any API.

<!--
**More Data Commons Visualization Projects**
[Observable with Data Commons](/data-commons/) - [Data Loaders How-To](/data-commons/dist/air/)

[Python CoLabs for GDC timeline automation - Air and Climate](/data-commons/dist/air)

[Kargil's notes](https://github.com/modelearth/Observables-DataLoader/tree/master/docs)

[Observable Framework Dashboard for UN Goals](https://observablehq.com/framework/) - with our .csv timelines and DuckDB Parquet impact files

TO DO: [Hosting DataCommons locally with Flask](/localsite/info/data/datacommons) - Vishnupriya and our GDC team
-->

## 2. Planet Langchain - LLM Interface

Recent work is also underway in [earthscape Anything LLM](https://model.earth/earthscape) and [Team AI Insights](https://model.earth/team/)


- [Planet Langchain Dev](/planet) within our [Planet Repo](https://github.com/modelearth/planet) for using [LangchainJS](https://github.com/langchain-ai/langchainjs).

- Our [repo pull page](../home/repo) uses GitHub's API to load images, music and text to send to LLM APIs using javascript.

- Our Langchain filters are being integrated with our [Storyboard Active Reader](/requests/) which loads prompts from .csv files and outputs to GitHub.

- TO DO: Add to our [Planet repo](https://github.com/modelearth/planet/) interface using [Langchain's Chat Models](https://python.langchain.com/docs/concepts/chat_models/).  

- Pull a page from any GitHub repo to an LLM API to provide train RAG using [LangChain.js](https://api.js.langchain.com) javascript.<!-- Dhananjay, Kelly, Adithya-->

- TO DO: Integrate [our API storage in javascript](/localsite/tools/storage/api/) to store API keys locally.


<!--See also: DataStax Astra DB

Langchain Python Repo
https://github.com/ModelEarth/langchain

[Conversational RAG for 10 LLMs](https://python.langchain.com/docs/tutorials/qa_chat_history/) - Pradeep and Pranoy 
Pradeep: Pinecone on AWS free 2 GB max
Pranoy: DocArray in memory Vecto Store (database)

We can also [remove LangChain to simplify](https://www.octomind.dev/blog/why-we-no-longer-use-langchain-for-building-our-ai-agents)

Content prep for RAG: [Innovations in Water Purification](/evaporation-kits/innovations/) - Hyper Desalination

**Retrieval-Interleaved Generation (RIG)**  
Using [Google Data Commons DataGemma AI](https://ai.google.dev/gemma/docs/datagemma) - For RIG, Zihan found that a paid Google plan was needed to avoid storage/memory errors/timeouts. Here's our [RIG CoLab](https://colab.research.google.com/drive/1eLtHOR6e3lAUVijUJ56VMaiTU6hA9enc?usp=sharing).
-->

### Earthscape NextJS Chatbot UI fork

- Our [Earthscape fork of Chatbot UI](https://model.earth/earthscape/app/) - React, Supabase and [NextJS Hosting using GitHub Pages](https://www.freecodecamp.org/news/how-to-deploy-next-js-app-to-github-pages/).

- Use commands to deploy to GitHub Pages for free static hosting.

<!-- Generate .CSV prompt files from location data pulled from Industry levels, Census stats and Google Data Commons. -->


## 3. RealityStream Machine Learning - Server-Side Python (ML)

[RealityStream ML](/realitystream/) - [Run Models Colab](/realitystream/input/industries/)

Frontend deployments to Google Cloud with Flask are in our [cloud repo](https://github.com/ModelEarth/cloud). Add a folder for your own Flask setups in the cloud repo. [Our webhook repo](https://github.com/ModelEarth/webhook) has a simple Flask example.


TO DO: Use our [cloud repo](https://github.com/ModelEarth/cloud/tree/main/run) and finalize Flask deployment step for interacting with our RealityStream Run Models colab backup file. [Cloud run config frontend](https://model.earth/cloud/run/)

<!--
**Anvil with our CoLabs:**
[Anvil Extras](https://anvil-extras.readthedocs.io/en/latest/guides/index.html) and [Anvil](https://anvil.works/learn/tutorials/data-science#connecting-notebooks) and [AnvilScope CoLab](https://colab.research.google.com/drive/1rlOPfOxRnfm4pTGSn3gk_MvmVF65iidF?usp=sharing) using Plotly - Soham
-->

<!--
- [StreamLit hosting within Open WebUI](https://github.com/streamlit/streamlit/issues/969)
-->


- [RealityStream](/realitystream/) - Machine Learning Classification Models - Xucen - Prathyusha
- [Process Industry NAICS by Zip Code](/community-zipcodes/mail) - DONE Yunbo
- [Open Data Panels - YAML Display](/profile) - Microsoft Plug and Play - TO DO
- [State Regions using Sets of Counties](/community-data/us/edd/) - Dinesh
- [USEEIO matrix files with clustering](/machine-learning/python/cluster/) - <!--Honglin-->Rupesh

<!--
- [CrewAI+Ollama integration](https://lightning.ai/lightning-ai/studios/ai-agents-powered-by-crewai) within our [Open WebUI fork](location)
- [Flowsa RStudio - API to JSON](/localsite/info/data/flowsa/)
-->

- [Update Farm Fresh Data pull](/community-data/process/python/farmfresh/) - Bhavna - DONE
- [Push EPA date to Google Data Commons API](https://docs.datacommons.org/api/)


## 4. International Trade Flow - SQL, Python, Javascript (IO)

[International Trade Flow SQL Data Prep](/profile/trade) - Exiobase Colab, charts and SQL
<!-- Contributors: Gary, Satya, Himanshu, Sahil, Poorna -->

NEW: We're [configuring SuiteCRM](../profile/crm/) to run in an Azure instance.

NEW: Update javascript report to use json generated from our Exiobase in CoLabs.

TO DO:  Find and embed/fork existing open source [UN Comtrade visualizations](https://comtradeplus.un.org/Visualization/Labs) with Exiobase data and/or [MARIO python](https://mario-suite.readthedocs.io/en/latest/intro.html).

IN PROGRESS: [Chord Chart json object](https://model.earth/useeio.js/footprint/chord) and [D3 Chord](/profile/charts/d3/chord_diagram_d3/) - Bindu and Lakshi

TO DO: [Python to pull Harmonized Code (HS) lookups into Supabase](/profile/harmonized-system/) - Kruthi

TO DO: [Sankey Industry eChart](/profile/charts/echarts/sankey-nodeAlign-left.html) - eCharts uses a common echarts.min.js file which we'll load in [Feed Viewer](/feed/view)

TO DO: [Python - Finalize our All the Places data by State and Zip](/places) - Poshan, Savar

#### Exiobase and Flask

For our [International Trade Flow](/profile/trade/) we can integrate our [Exiobase-Global-Trade GitHub Repo](https://github.com/modelearth/exiobase-global-trade) and a new [Comtrade API pull](https://github.com/ModelEarth/exiobase-global-trade/tree/main/comtrade)

#### US EPA State Impacts

TO DO: Pull into SQL DuckDB

[Javascript updates for US EPA impact reports](/useeio.js/footprint/) - Lakshit, Abhishek N, Hitesh R
[React Team - Mosaic column checkboxes](/io/charts)  - Pallavi 
[React Team - Commodity Totals](/localsite/info/data/totals/) in [Jobs Reports](/localsite/info/#indicators=JOBS)
[Impact Label Pipeline](/apps/impact) - Starting point for duplicating US EPA RStudio in python


## 5. Open Footprint Interactive Labels (Open)

[Open Footprint Builder](/io/template/) - [Profile Object Javascript](/profile/item/) - [BuildingTransparency.org Impact API](/profile/products/)


**BuildingTransparency and Open Footprint labels**

Bhavna, Yash, Apurva, Vennela

- [Use our state map filter](#geoview=country) with colors for [new USEEIO reporting maps](https://figshare.com/collections/USEEIO_State_Models_v1_0_-_Supporting_Figures/7041473)
- [BuildingTransparency - Product Impact Profiles by State and Zip](/io/template/feed/) - TO DO <!--Ronan--> - Vennela
- [BuildingTransparency - API Aggregates of States and Countries](/io/template/product/) - Initially Luwei
- [BuildingTransparency - JSON file pull for impact templates](/io/template/product/) - Apurva



## 6. FeedPlayer with MemberSense (React)

Embeddable player for Image and Video sequences pulled from APIs and Google Sheets

- [Discord API](https://discord.com/developers/docs/intro) - Our Team list is pulled from the Discord API into our Feed Player

- [Feed Player](../feed/) - Video and Images from API feeds and Google Sheet lists
- [NASA Feed Viewer](../feed/view/#feed=nasa) - JSON, YAML, CSS, RSS - [See Click Fix Address Lookup](/feed/view/#feed=seeclickfix-311)

<!--
- [Add Datawrapper.de](https://www.datawrapper.de/) using "link external dataset"

- [Pull from Supabase (or backup file) into databricks SQL](https://chatgpt.com/share/d610d3e6-ce5f-4e7f-ba9e-4c74ec23abd4) - Apurva, Soham
- [View DuckDB from Javascript](/profile/prep/sql/duckdb/) - Kelly, Gary
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
