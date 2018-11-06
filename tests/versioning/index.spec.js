/* globals describe it */
const chai = require('chai')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')

chai.use(sinonChai)

const { expect } = chai

const versioning = require('../../lib/versioning')

const fsSpies = () => ({
  existsSync: sinon.stub(),
  readFileSync: sinon.stub(),
})

describe('versioning module', () => {
  describe('implementation', () => {
    describe('readAssetsVersion', () => {
      it('checks for .slsart file', () => {
        const fs = fsSpies()

        versioning(fs)('target-project').readAssetsVersion()

        expect(fs.existsSync.calledOnce).to.be.true
        expect(fs.existsSync.firstCall.args[0]).to.equal('target-project/.slsart')
      })

      it('reads version from .slsart file, if found', () => {
        const fs = fsSpies()
        fs.existsSync.returns(true)
        fs.readFileSync.returns('version: 1.2.3')

        const versionRead = versioning(fs)('target-project').readAssetsVersion()

        expect(fs.existsSync.calledOnce).to.be.true
        expect(fs.existsSync.firstCall.args[0]).to.equal('target-project/.slsart')
        expect(versionRead).to.equal('1.2.3')
      })

      it('returns 0.0.0 if no .slsart file found', () => {
        const fs = fsSpies()
        fs.existsSync.returns(false)

        const versionRead = versioning(fs)('target-project').readAssetsVersion()

        expect(fs.existsSync.calledOnce).to.be.true
        expect(fs.existsSync.firstCall.args[0]).to.equal('target-project/.slsart')
        expect(versionRead).to.equal('0.0.0')
      })
    })

    describe('validateProjectDependencies', () => {
      it('reads form the package.json', () => {
        const fs = fsSpies()
        fs.existsSync.withArgs('target-project/.slsart').returns(false)
        fs.readFileSync.withArgs('target-project/package.json').returns('{}')

        expect(versioning(fs)('target-project').validateProjectDependencies({}))
          .to.equal(undefined)

        expect(fs.readFileSync.calledOnce).to.be.true
        expect(fs.readFileSync.firstCall.args[0]).to.equal('target-project/package.json')
      })

      it('expects to find correct dependencies', () => {
        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/package.json').returns(`{
          "dependencies": {
             "some-package": "^1.0",
             "another-package": "2.0.4"
          }
        }`)

        expect(() => versioning(fs)('target-project').validateProjectDependencies({
          'some-package': '^1.0',
          'another-package': '2.0.4',
        })).to.not.throw()
      })

      it('throws if dependencies are missing', () => {
        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/package.json').returns(`{
          "dependencies": {
          }
        }`)

        expect(() => versioning(fs)('target-project').validateProjectDependencies({
          'some-package': '^1.0',
          'another-package': '2.0.4',
        })).to.throw('Missing package.json dependency: some-package, another-package')
      })

      it('throws if dependencies are wrong version', () => {
        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/package.json').returns(`{
          "dependencies": {
            "some-package": "^2.0",
            "another-package": "9.9.9"
          }
        }`)

        expect(() => versioning(fs)('target-project').validateProjectDependencies({
          'some-package': '^1.0',
          'another-package': '2.0.4',
        })).to.throw('Invalid package.json dependency package version found:\n' +
          '\tsome-package expected ^1.0 found ^2.0\n' +
          '\tanother-package expected 2.0.4 found 9.9.9')
      })
    })

    describe('validateServiceConfiguration', () => {
      const fs = fsSpies()

      const constants = {
        TestFunctionName: 'loadGenerator',
        ScheduleName: '${self:service}-${opt:stage, self:provider.stage}-monitoring', // eslint-disable-line no-template-curly-in-string
        AlertingName: 'monitoringAlerts',
      }

      const validService = () => ({
        provider: {
          iamRoleStatements: [],
        },
        functions: {
          [constants.TestFunctionName]: {
            handler: '',
            timeout: '',
          },
        },
      })

      const aString = 'some value'
      let service
      // service config
      it('rejects falsy service configurations', () => {
        service = undefined
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects non-object service configurations', () => {
        service = aString
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      // provider.iamRoleStatements
      it('rejects falsy provider', () => {
        service = validService()
        service.provider = false
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects falsy provider.iamRoleStatements', () => {
        service = validService()
        service.provider.iamRoleStatements = false
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects non-array provider.iamRoleStatements', () => {
        service = validService()
        service.provider.iamRoleStatements = aString
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      // functions[constants.TestFunctionName]
      it('rejects falsy functions', () => {
        service = validService()
        service.functions = false
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects falsy functions[constants.TestFunctionName]', () => {
        service = validService()
        service.functions[constants.TestFunctionName] = false
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects non-object functions[constants.TestFunctionName]', () => {
        service = validService()
        service.functions[constants.TestFunctionName] = aString
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      // functions[constants.TestFunctionName].environment['TOPIC_ARN' || 'TOPIC_NAME']
      it('accepts undefined functions[constants.TestFunctionName].environment', () => {
        service = validService()
        delete service.functions[constants.TestFunctionName].environment
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.not.throw()
      })
      it('accepts functions[constants.TestFunctionName].environment without TOPIC_ARN or TOPIC_NAME', () => {
        service = validService()
        service.functions[constants.TestFunctionName].environment = { NOT_TOPIC_ARN_OR_TOPIC_NAME: aString }
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.not.throw()
      })
      it('rejects functions[constants.TestFunctionName].environment with TOPIC_ARN', () => {
        service = validService()
        service.functions[constants.TestFunctionName].environment = { TOPIC_ARN: aString }
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects functions[constants.TestFunctionName].environment with TOPIC_NAME', () => {
        service = validService()
        service.functions[constants.TestFunctionName].environment = { TOPIC_NAME: aString }
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      // functions[constants.TestFunctionName].events
      it('accepts an undefined functions[constants.TestFunctionName].events', () => {
        service = validService()
        delete service.functions[constants.TestFunctionName].events
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.not.throw()
      })
      it('rejects non-array functions[constants.TestFunctionName].events', () => {
        service = validService()
        service.functions[constants.TestFunctionName].events = aString
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      it('rejects functions[constants.TestFunctionName].events with a schedule event named constants.ScheduleName', () => {
        service = validService()
        service.functions[constants.TestFunctionName].events = [{ schedule: { name: constants.ScheduleName } }]
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
      // resources.Resources[constants.AlertingName]
      it('accepts an undefined resources.Resources[constants.AlertingName]', () => {
        service = validService()
        delete service.resources
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.not.throw()
      })
      it('accepts an undefined resources.Resources[constants.AlertingName]', () => {
        service = validService()
        if (service.resources) {
          delete service.resources.Resources
        }
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.not.throw()
      })
      it('accepts an undefined resources.Resources[constants.AlertingName]', () => {
        service = validService()
        if (service.resources && service.resources.Resources) {
          delete service.resources.Resources[slsart.constants.AlertingName]
        }
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.not.throw()
      })
      it('reject a defined resources.Resources[constants.AlertingName]', () => {
        service = validService()
        service.resources = {
          Resources: {
            [constants.AlertingName]: aString,
          },
        }
        expect(() => versioning(fs)('target-project').validateServiceConfiguration(service, constants)).to.throw()
      })
    })

    describe('validateServiceDefinition', () => {
      it('reads form the serverless.yml', () => {
        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/serverless.yml').returns('')

        expect(() => versioning(fs)('target-project').validateServiceDefinition('target-project'))
          .to.throw()

        expect(fs.readFileSync.calledOnce).to.be.true
        expect(fs.readFileSync.firstCall.args[0]).to.equal('target-project/serverless.yml')
      })

      const validateScriptConfig = (
        config,
        message,
        errorType
      ) => {
        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/serverless.yml').returns(config)

        let exceptionThrown = false;

        try {
          versioning(fs)('target-project').validateServiceDefinition()
        } catch(ex) {
          exceptionThrown = true
          expect(ex.message).to.equal(message)
          expect(ex.name).to.equal(errorType)
        }
        expect(exceptionThrown).to.be.true
      }

      it('checks if the script is an object', () => {
        validateScriptConfig(
          '',
          'data should be object',
          'UpdatePreconditionError'
        )
      })

      it('checks if the given service must have "provider.iamRoleStatements" defined as an array', () => {
        validateScriptConfig(
          'provider:\n' +
          '  name: aws',
          'data.provider should have required property \'iamRoleStatements\'',
          'UpdatePreconditionError'
        )
      })

      it('requires the service to have a functions property', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []',

          'data should have required property \'functions\'',
          'UpdatePreconditionError'
        )
      })

      it('requires the service to have a functions property which is an object', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions: ""',

          'data.functions should be object',
          'UpdatePreconditionError'
        )
      })

      it('requires the service to have a function with the name "loadGenerator"', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions: {}',

          'data.functions should have required property \'loadGenerator\'',
          'UpdatePreconditionError'
        )
      })

      it('requires the service to have a "loadGenerator" function as an object', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator: ""',

          'data.functions.loadGenerator should be object',
          'UpdatePreconditionError'
        )
      })

      it('requires the service to have a "loadGenerator" function to have a handler', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator: {}',

          'data.functions.loadGenerator should have required property \'.handler\'',
          'UpdatePreconditionError'
        )
      })

      it('requires the service to have a "loadGenerator" function to have a timeout', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n',

          'data.functions.loadGenerator should have required property \'.timeout\'',
          'UpdatePreconditionError'
        )
      })

      it('validates a minimum script', () => {
        const config =
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n'

        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/serverless.yml').returns(config)

        expect(() => versioning(fs)('target-project').validateServiceDefinition())
          .not.to.throw()
      })

      it('checks if the given service has function "loadGenerator" that already has environment variable "TOPIC_ARN" defined.', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n' +
          '    environment:\n' +
          '      TOPIC_ARN: arn\n',

          'data.functions.loadGenerator.environment should match pattern "^(?!TOPIC_ARN|TOPIC_NAME).*", data.functions.loadGenerator.environment property name \'TOPIC_ARN\' is invalid',
          'UpdateConflictError'
        )
      })

      it('checks if the given service has function "loadGenerator" that already has environment variable "TOPIC_NAME" defined.', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n' +
          '    environment:\n' +
          '      TOPIC_NAME: aTopic',

          'data.functions.loadGenerator.environment should match pattern "^(?!TOPIC_ARN|TOPIC_NAME).*", data.functions.loadGenerator.environment property name \'TOPIC_NAME\' is invalid',
          'UpdateConflictError'
        )
      })

      it('checks if defined, that the events attribute of the "loadGenerator" function must be an array.', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n' +
          '    events: one',

          'data.functions.loadGenerator.events should be array',
          'UpdateConflictError'
        )
      })

      it('checks if "loadGenerator" function already has a schedule event named "${self:service}-${opt:stage, self:provider.stage}-monitoring"', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n' +
          '    events:\n' +
          '      - schedule:\n' +
          '          name: ${self:service}-${opt:stage, self:provider.stage}-monitoring\n',

          'data.functions.loadGenerator.events[0].schedule.name should match pattern "^(?!\\${self:service}-\\${opt:stage, self:provider\\.stage}-monitoring).*"',
          'UpdateConflictError'
        )
      })

      it('checks if a resource with logical ID monitoringAlerts already exists', () => {
        validateScriptConfig(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n' +
          '    events:\n' +
          '      - schedule:\n' +
          '          name: scheduleName\n' +
          'resources:\n' +
          '  Resources:\n' +
          '    monitoringAlerts:\n' +
          '      Type: \'AWS::SNS::Topic\'\n',

          'data.resources.Resources should match pattern "^(?!monitoringAlerts).*", data.resources.Resources property name \'monitoringAlerts\' is invalid',
          'UpdateConflictError'
        )
      })

      it('validates a valid service configuration script', () => {
        const fs = fsSpies()
        fs.readFileSync.withArgs('target-project/serverless.yml').returns(
          'provider:\n' +
          '  iamRoleStatements: []\n' +
          'functions:\n' +
          '  loadGenerator:\n' +
          '    handler: ""\n' +
          '    timeout: ""\n' +
          '    events:\n' +
          '      - schedule:\n' +
          '          name: scheduleName\n' +
          'resources:\n' +
          '  Resources:\n' +
          '    anotherTopic:\n' +
          '      Type: \'AWS::SNS::Topic\'\n',

          'A resource with logical ID monitoringAlerts already exists',
          'UpdateConflictError'
        )

        expect(() => versioning(fs)('target-project').validateServiceDefinition())
          .to.not.throw()
      })
    })

    describe('determineFunctionAssetFiles', () => {
      it('generates a correct list for v0.0.0', () => {
        const fs = fsSpies()

        expect(versioning(fs)('target-project').determineFunctionAssetFiles('0.0.0'))
          .to.deep.equal([
            'handler.js',
            'package.json',
            'serverless.yml',
          ])
      })
    })

    describe('checkForServiceFiles', () => {
      it('looks for version 0.0.0 files', () => {
        const fs = fsSpies()
        fs.existsSync.withArgs('target-project/.slsart').returns(false)
        fs.existsSync.withArgs('target-project/handler.js').returns(true)
        fs.existsSync.withArgs('target-project/package.json').returns(true)
        fs.existsSync.withArgs('target-project/serverless.yml').returns(true)

        expect(() => versioning(fs)('target-project').checkForServiceFiles())
          .to.not.throw()
      })

      it('throws if one of the files is missing', () => {
        const fs = fsSpies()
        fs.existsSync.withArgs('target-project/.slsart').returns(false)
        fs.existsSync.withArgs('target-project/handler.js').returns(false)
        fs.existsSync.withArgs('target-project/package.json').returns(true)
        fs.existsSync.withArgs('target-project/serverless.yml').returns(true)

        expect(() => versioning(fs)('target-project').checkForServiceFiles())
          .to.throw(/handler\.js/)
      })

      it('lists all the files, if missing', () => {
        const fs = fsSpies()
        fs.existsSync.withArgs('target-project/.slsart').returns(false)
        fs.existsSync.withArgs('target-project/handler.js').returns(false)
        fs.existsSync.withArgs('target-project/package.json').returns(false)
        fs.existsSync.withArgs('target-project/serverless.yml').returns(false)

        expect(() => versioning(fs)('target-project').checkForServiceFiles())
          .to.throw(/target-project\/handler\.js, target-project\/package\.json, target-project\/serverless\.yml/)
      })
    })
  })
})
