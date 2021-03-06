const nxPreset = require('@nrwl/jest/preset');

module.exports = {
	...nxPreset,
	collectCoverage: true,
	coverageReporters: ['json','text'],
	setupFilesAfterEnv: [
		"jest-extended",
		"jest-chain"
	  ]
};
