import * as assert from "assert"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import * as mkdirp from "mkdirp"

import { Oni } from "./common"

const LongTimeout = 5000

const CiTests = [
    "AutoCompletionTest",
    "BasicEditingTest",
    "QuickOpenTest",
    "NoInstalledNeovim",
]

// tslint:disable:no-console

import * as Platform from "./../browser/src/Platform"

export interface ITestCase {
    name: string
    testPath: string
    configPath: string
}

const normalizePath = (p) => p.split("\\").join("/")

const loadTest = (testName: string): ITestCase => {
    const ciPath = path.join(__dirname, "ci")
    const testPath = path.join(ciPath, testName + ".js")

    const testMeta = require(testPath)
    const testDescription = testMeta.settings || {}

    const normalizedMeta: ITestCase = {
        name: testDescription.name || testName,
        testPath: normalizePath(testPath),
        configPath: testDescription.configPath ? normalizePath(path.join(ciPath, testDescription.configPath)) : "",
    }

    return normalizedMeta
}

describe("ci tests", function() { // tslint:disable-line only-arrow-functions
    // Retry up to two times
    this.retries(2)

    const configFolder = Platform.isWindows() ? path.join(Platform.getUserHome(), "oni") :
                                                path.join(Platform.getUserHome(), ".oni")
    const configPath = path.join(configFolder, "config.js")

    const temporaryConfigPath = path.join(os.tmpdir(), "config.js")

    before(() => {

        if (!fs.existsSync(configFolder)) {
            console.log("Config folder doesn't exist - creating.")
            mkdirp.sync(configFolder)
            console.log("Config folder created successfully.")
        }

        if (fs.existsSync(configPath)) {
            console.log("Backing up config to: " + temporaryConfigPath)
            const configContents = fs.readFileSync(configPath, "utf8")
            fs.writeFileSync(temporaryConfigPath, configContents)
            console.log("Config backed up.")
            console.log("Removing existing config..")
            fs.unlinkSync(configPath)
            console.log("Existing config removed")
        }
    })

    after(() => {
        if (fs.existsSync(temporaryConfigPath)) {
            console.log("Restoring config from: " + temporaryConfigPath)
            const configContents = fs.readFileSync(temporaryConfigPath, "utf8")
            fs.writeFileSync(configPath, configContents)
            console.log("Config restored to: " + configPath)
            console.log("Deleting temporary config.")
            fs.unlinkSync(temporaryConfigPath)
            console.log("Temporary config successfuly deleted.")
        }
    })

    CiTests.forEach((test) => {

        describe(test, () => {

            const testCase = loadTest(test)

            let oni: Oni

            beforeEach(async () => {

                if (testCase.configPath) {
                    console.log("Writing config from: " + testCase.configPath)
                    const configContents = fs.readFileSync(testCase.configPath)
                    console.log("Writing config to: " + configPath)
                    fs.writeFileSync(configPath, configContents)
                }

                oni = new Oni()
                await oni.start()
            })

            afterEach(async () => {
                await oni.close()

                if (fs.existsSync(configPath)) {
                    console.log("--Removing existing config..")
                    fs.unlinkSync(configPath)
                }
            })

            it("ci test: " + test, async () => {
                await oni.client.waitForExist(".editor", LongTimeout)
                const text = await oni.client.getText(".editor")
                assert(text && text.length > 0, "Validate editor element is present")

                console.log("Test path: " + testCase.testPath) // tslint:disable-line

                oni.client.execute("Oni.automation.runTest('" + testCase.testPath + "')")

                console.log("Waiting for result...") // tslint:disable-line
                await oni.client.waitForExist(".automated-test-result", 30000)
                const resultText = await oni.client.getText(".automated-test-result")
                console.log("Got result: " + resultText) // tslint:disable-line

                const result = JSON.parse(resultText)
                assert.ok(result.passed)
            })
        })
    })
})
