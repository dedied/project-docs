# Sentinel
An attempt to document workflow and tests needed...
## Setup
### VSCode
- preview `.md` file via `Ctr+Shift+V`
### Github
- clone this repo
- generate your `Secrets * Variables --> Actions --> Repository Secrets` for `CHECKILY_API` and `CHECKILY_PROJECT_ID`
- run `npm install` to install dependancies
- ensure the following sort of deployment files are in your target project that you're testing:
  - `deploy.yml`:
```
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

```
  - `checkly.yml`
```
name: Run Checkly Tests

on:
  workflow_run:
    workflows: ["Deploy to GitHub Pages"]
    types:
      - completed
  workflow_dispatch:

jobs:
  checkly-tests:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Run Checkly cloud tests
        id: checkly
        env:
          CHECKLY_API_KEY: ${{ secrets.CHECKILY_API }}
          CHECKLY_ACCOUNT_ID: ${{ secrets.CHECKILY_PROJECT_ID }}
        run: |
          echo "Triggering Checkly cloud tests..."
          npx checkly trigger | tee checkly-output.txt

          if grep -q "Error:" checkly-output.txt; then
            echo "Checkly reported an error. Failing the workflow."
            exit 1
          fi

      - name: Summarise Checkly failures for AI Studio
        if: failure()
        run: |
          echo "### ❌ Checkly cloud tests failed" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Copy the output below into Google AI Studio to generate a fix:" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "\`\`\`" >> $GITHUB_STEP_SUMMARY
          echo "The following is the output from some automated testing of the application that highlights errors. Please examine the errors and provide a fix." >> $GITHUB_STEP_SUMMARY
          cat checkly-output.txt >> $GITHUB_STEP_SUMMARY
          echo "\`\`\`" >> $GITHUB_STEP_SUMMARY

```
### Checkly
- create account at https://app.checklyhq.com/
- create API key for GitHub to use
- ensure you use the metadata tags to associate the tests after initial deployment
  - grab the ids
    ```
    curl -s https://api.checklyhq.com/v1/checks -H "Authorization: Bearer <CHECKILY_API>" -H "x-checkly-account: <CHECKLY_PROJECT_ID>" | jq '.[] | {name: .name, id: .id}'
    ```
  - then use that id in the tag on your `xxx.spec.ts` file:
    ```
    // @checklyId <CHECKLY_ID>
    // @checklyName FitTrack Basic Check
    ```
- useful commands
  - Open up browser to record a test
    ```
    npx playwright codegen https://dedied.github.io/fittrack-pro/
    ```
  - Run the tests locally
    ```
    npx checkly test
    ```
  - Deploy the tests to remote
    ```
    npx checkly deploy
    ```
  - Trigger the remote tests
    ```
    npx checkly trigger
    ```
## Workflow
- see an error in ai studio
- deploy to github
- write the test to detect the error and check it works: `npx checkly test`
- deploy the test: `npx checkly deploy`