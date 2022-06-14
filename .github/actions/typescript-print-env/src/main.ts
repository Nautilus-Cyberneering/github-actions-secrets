import * as core from '@actions/core'

const run = async (): Promise<void> => {
  try {
    Object.entries(process.env).forEach(([key, value]) => { 
      core.info(`${key}=${value}`)
    })
  } catch (error) {
    core.setFailed(`Failure: ${error}`)
  }
}

run()

export default run
