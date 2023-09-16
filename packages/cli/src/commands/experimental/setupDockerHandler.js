import fs from 'fs'
import path from 'path'

import execa from 'execa'
import { Listr } from 'listr2'

import { getConfigPath } from '@redwoodjs/project-config'
import { errorTelemetry } from '@redwoodjs/telemetry'

import { getPaths, writeFile } from '../../lib'
import c from '../../lib/colors'
// import { installRedwoodModule } from '../../lib/packages'

export async function handler({ force }) {
  const dockerfileTemplateContent = fs.readFileSync(
    path.resolve(__dirname, 'templates', 'docker', 'Dockerfile'),
    'utf-8'
  )
  const dockerComposeDevTemplateContent = fs.readFileSync(
    path.resolve(__dirname, 'templates', 'docker', 'docker-compose.dev.yml'),
    'utf-8'
  )
  const dockerComposeProdTemplateContent = fs.readFileSync(
    path.resolve(__dirname, 'templates', 'docker', 'docker-compose.prod.yml'),
    'utf-8'
  )

  const dockerfilePath = path.join(getPaths().base, 'Dockerfile')
  const dockerComposeDevFilePath = path.join(
    getPaths().base,
    'docker-compose.dev.yml'
  )
  const dockerComposeProdFilePath = path.join(
    getPaths().base,
    'docker-compose.prod.yml'
  )

  const tasks = new Listr(
    [
      {
        title: 'Confirmation',
        task: async (_ctx, task) => {
          const confirmation = await task.prompt({
            type: 'Confirm',
            message: 'The Dockerfile is experimental. Continue?',
          })

          if (!confirmation) {
            throw new Error('User aborted')
          }
        },
        skip: force,
      },

      {
        title: 'Adding the official yarn workspace-tools plugin...',
        task: async (_ctx, task) => {
          const { stdout } = await execa.command('yarn plugin runtime --json', {
            cwd: getPaths().base,
          })

          const hasWorkspaceToolsPlugin = stdout
            .trim()
            .split('\n')
            .map(JSON.parse)
            .some(({ name }) => name === '@yarnpkg/plugin-workspace-tools')

          if (hasWorkspaceToolsPlugin) {
            task.skip(
              'The official yarn workspace-tools plugin is already installed'
            )
            return
          }

          return execa.command('yarn plugin import workspace-tools', {
            cwd: getPaths().base,
          }).stdout
        },
      },

      // TODO: figure out what version to add
      {
        title: 'Adding @redwoodjs/api-server to the api side...',
        task: async (_ctx, _task) => {
          return execa.command('yarn workspace api add @redwoodjs/api-server', {
            cwd: getPaths().base,
          }).stdout
        },
      },

      {
        title: 'Adding @redwoodjs/web-server to the web side...',
        task: async (_ctx, _task) => {
          return execa.command('yarn workspace web add @redwoodjs/web-server', {
            cwd: getPaths().base,
          }).stdout
        },
      },

      // TODO: add docker ignore file
      {
        title: 'Adding the experimental Dockerfile and compose files...',
        task: (_ctx, _task) => {
          // const shouldSkipAddingFiles = [
          //   dockerfilePath,
          //   dockerComposeDevFilePath,
          //   dockerComposeProdFilePath,
          // ].every(fs.existsSync)
          fs.writeFileSync(dockerfilePath, dockerfileTemplateContent)

          fs.writeFileSync(
            dockerComposeDevFilePath,
            dockerComposeDevTemplateContent
          )

          fs.writeFileSync(
            dockerComposeProdFilePath,
            dockerComposeProdTemplateContent
          )
        },
      },

      // TODO: update .gitignore
      // TODO: turn off open
      {
        title: 'Adding config to redwood.toml...',
        task: (_ctx, task) => {
          const redwoodTomlPath = getConfigPath()
          const configContent = fs.readFileSync(redwoodTomlPath, 'utf-8')

          if (!configContent.includes('[experimental.dockerfile]')) {
            // using string replace here to preserve comments and formatting.
            writeFile(
              redwoodTomlPath,
              configContent.concat(
                `\n[experimental.dockerfile]\n\tenabled = true\n`
              ),
              {
                overwriteExisting: true,
              }
            )
          } else {
            task.skip(
              `The [experimental.dockerfile] config block already exists in your 'redwood.toml' file`
            )
          }
        },
      },
    ],

    {
      renderer: process.env.NODE_ENV === 'test' ? 'verbose' : 'default',
    }
  )

  try {
    await tasks.run()

    console.log([
      'See docs at... https://redwoodjs.com/docs/docker',
      "we've written a dockerfile to...",
      'to start this...',
      'to deploy...',
    ])
  } catch (e) {
    errorTelemetry(process.argv, e.message)
    console.error(c.error(e.message))
    process.exit(e?.exitCode || 1)
  }
}
