const { guessProductionMode } = require("@ngneat/tailwind");

module.exports = {
	important: true,
	prefix: '',
	purge: {
		enabled: guessProductionMode(),
		content: ['./apps/**/*.{html,ts}', './libs/**/*.{html,ts}'],
	},
	darkMode: 'class', // or 'media' or 'class'
	theme: {
		extend: {},
	},
	variants: {
		extend: {},
	},
	plugins: [],
};
