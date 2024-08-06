
# Build and Install Locally

## Manual Install w/o Ollama

For Linux/MacOS:

```zsh
./location/setup/script/start.sh
```

For Windows:

```
copy .env.example .env

npm install
npm run build

cd .\backend

# Optional: To install using Conda as your development environment, follow these instructions:
# Create and activate a Conda environment
conda create --name open-webui-env python=3.11
conda activate open-webui-env

pip install -r requirements.txt -U

start.bat
```

page should be up at http://localhost:8080 

## Using Docker w/ Ollama

Make sure you have [docker](https://www.docker.com/products/docker-desktop/) and [Ollama](https://ollama.com/) installed. Also, follow this [guide](https://github.com/ollama/ollama/blob/86b907f82ad1cc5eb16e919d6cb5830765d73be4/docs/faq.md?plain=1#L62) to expose Ollama server. Then run this command:

```zsh
docker run -d -p 3000:8080 -e -v open-webui:/app/backend/data --name open-webui --restart always [PROJECT_IAMGE]
```

## Other Installation Methods

Checkout Open WebUI official documentation [here](https://docs.openwebui.com/).
