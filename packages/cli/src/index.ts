#!/usr/bin/env node

import * as chalk from 'chalk';
import * as child from 'child_process';
import * as ejs from 'ejs';
import * as fse from 'fs-extra';
import * as inquirer from 'inquirer';
import * as path from 'path';

async function determineWorkspaceName(): Promise<string> {
	const result = await inquirer.prompt<{ workspace: string }>( [
		{
			name: 'workspace',
			message: 'Workspace name (e.g., org name)    ',
			type: 'string',
		},
	] );

	const workspace = result.workspace ?? '';
	if ( !workspace ) {
		console.error( chalk.red( 'Workspace name cannot be empty' ) );
		process.exit( 1 );
	}

	return workspace;
}

async function determineAppName(): Promise<string> {
	const result = await inquirer.prompt<{ app: string }>( [
		{
			name: 'app',
			message: 'Application name                   ',
			type: 'string',
		},
	] );

	const app = result.app ?? '';
	if ( !app ) {
		console.error( chalk.red( 'Application name cannot be empty' ) );
		process.exit( 1 );
	}

	return app;
}

const templateDir = path.join( __dirname, '..', 'templates' );

async function main() {
	try {
		execSync( 'nx --help', { stdio: 'ignore' } );
	}
	catch ( err ) {
		if ( ( err as { status: number } )?.status === 127 ) {
			console.log( '' );
			console.log( chalk.red( 'You must have the Nx CLI installed to use create-material-angular-workspace' ) );
			console.log( '' );
			console.log( `Run ${ chalk.blue( 'npm install -g nx@latest' ) } to install the Nx CLI` );
			console.log( '' );
			process.exit( 1 );
		}
	}


	const workspace = await determineWorkspaceName();
	const workspaceDir = path.join( process.cwd(), workspace );

	const app = await determineAppName();
	const appDir = path.join( workspaceDir, 'apps', app );

	// Run the default Nx create workspace setup for angular
	execSync( `npx --yes create-nx-workspace@latest ${ workspace } --preset=angular --style=scss --linter=eslint --appName=${ app }` );

	// Add Angular Material
	execSync( 'nx add @angular/material@latest --typography --animations', { cwd: workspaceDir } );

	// Add Angular Localize
	execSync( 'nx add @angular/localize@latest', { cwd: workspaceDir } );

	// Add Angular FlexBox directives
	execSync( 'npm install @angular/flex-layout@latest', { cwd: workspaceDir } );

	//Add NgRx
	execSync( `nx g ngrx app --root --no-interactive --project ${ app } --module ${ path.join( 'apps', app, 'src', 'app', 'app.module.ts' ) }`, { cwd: workspaceDir } );
	execSync( 'nx add @ngrx/data', { cwd: workspaceDir } );

	// // Add Firebase
	// execSync( 'nx add @angular/fire@latest', { cwd: workspaceDir } );

	// Update all of the existing packages except typescript
	execSync( 'npx --yes npm-check-updates -x "typescript" -u', { cwd: workspaceDir } );
	execSync( 'npm install --legacy-peer-deps', { cwd: workspaceDir } );

	// Setup Extra ESLint plugins
	execSync( 'npm install --save-dev eslint-plugin-import', { cwd: workspaceDir } );
	execSync( 'npm install --save-dev eslint-plugin-prefer-arrow', { cwd: workspaceDir } );
	execSync( 'npm install --save-dev eslint-plugin-simple-import-sort', { cwd: workspaceDir } );

	//Add useful utility packages
	execSync( 'npm install await-to-js', { cwd: workspaceDir } );

	await renderToFile( path.join( 'vscode', 'extensions.json.ejs' ), path.join( workspaceDir, '.vscode', 'extensions.json' ), { workspace, app } );
	await renderToFile( path.join( 'vscode', 'settings.json.ejs' ), path.join( workspaceDir, '.vscode', 'settings.json' ), { workspace, app } );
	await renderToFile( path.join( 'editorconfig.ejs' ), path.join( workspaceDir, '.editorconfig' ), { workspace, app } );
	await renderToFile( path.join( 'eslintrc.json.ejs' ), path.join( workspaceDir, '.eslintrc.json' ), { workspace, app } );
	await renderToFile( path.join( 'tsconfig.base.json.ejs' ), path.join( workspaceDir, 'tsconfig.base.json' ), { workspace, app } );

	const nxAppHtml = await fse.readFile( path.join( appDir, 'src', 'app', 'app.component.html' ) );

	await renderToFile( path.join( 'apps', '<app>', 'landing', 'landing.component.html.ejs' ), path.join( appDir, 'src', 'app', 'landing', 'landing.component.html' ), { workspace, app, nxAppHtml } );
	await renderToFile( path.join( 'apps', '<app>', 'landing', 'landing.component.scss.ejs' ), path.join( appDir, 'src', 'app', 'landing', 'landing.component.scss' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'landing', 'landing.component.spec.ts.ejs' ), path.join( appDir, 'src', 'app', 'landing', 'landing.component.spec.ts' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'landing', 'landing.component.ts.ejs' ), path.join( appDir, 'src', 'app', 'landing', 'landing.component.ts' ), { workspace, app } );


	await renderToFile( path.join( 'apps', '<app>', 'material.module.ts.ejs' ), path.join( appDir, 'src', 'app', 'material.module.ts' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'app-routing.module.ts.ejs' ), path.join( appDir, 'src', 'app', 'app-routing.module.ts' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'app.component.scss.ejs' ), path.join( appDir, 'src', 'app', 'app.component.scss' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'app.component.html.ejs' ), path.join( appDir, 'src', 'app', 'app.component.html' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'app.module.ts.ejs' ), path.join( appDir, 'src', 'app', 'app.module.ts' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>-e2e', 'eslintrc.json.ejs' ), path.join( appDir, 'eslintrc.json' ), { workspace, app } );

	execSync( 'nx run-many --target=lint --all --fix', { cwd: workspaceDir } );
}


void ( async () => {
	await main();
} )();

function execSync( command: string, options?: child.ExecSyncOptions ) {
	if ( options?.stdio !== 'ignore' ) {
		console.log( chalk.gray( command ) );
	}
	child.execSync( command, { stdio: options?.stdio ?? 'inherit', cwd: options?.cwd } );
}

async function renderToFile( relativeTemplatePath: string, outputPath: string, data?: ejs.Data ) {
	const templatePath = path.join( templateDir, relativeTemplatePath );
	const output = await ejs.renderFile( templatePath, data ?? {}, { async: true } );
	await fse.outputFile( outputPath, output );
}
