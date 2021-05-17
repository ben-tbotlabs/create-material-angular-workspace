#!/usr/bin/env node

import * as chalk from 'chalk';
import * as child from 'child_process';
import * as ejs from 'ejs';
import * as fse from 'fs-extra';
import * as inquirer from 'inquirer';
import * as _ from 'lodash';
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

async function determineLayout(): Promise<string> {
	const result = await inquirer.prompt<{ layout: string }>( [
		{
			name: 'layout',
			message: 'Nx Layout (empty for default)      ',
			type: 'string',
		},
	] );

	const layout = result.layout ?? '';
	return layout;
}

const templateDir = path.join( __dirname, '..', 'templates' );

let npxForceInstall = '--ignore-existing'

async function setupNPX() {
	const result = await execSyncCapture( 'npx --ignore-existing' );
	if ( result.stdErr.includes( '--ignore-existing argument has been removed' ) ) {
		npxForceInstall = '--yes'
	}
}

function runNCU( workspaceDir: string ) {
	execSync( `npx ${ npxForceInstall } npm-check-updates@latest -x "typescript,rxjs,cypress" -u`, { cwd: workspaceDir } );
	execSync( 'npm install', { cwd: workspaceDir } );
}


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

	await setupNPX();

	const workspace = await determineWorkspaceName();
	const app = await determineAppName();
	const layout = await determineLayout();

	// const workspace = 'sandbo';
	// const app = 'web';
	// const layout = '';

	const workspaceDir = path.join( process.cwd(), workspace );

	const appsRelative = layout ? path.join( layout, 'apps' ) : path.join( 'apps' );
	const appsDir = path.join( workspaceDir, appsRelative );
	const libsDir = layout ? path.join( workspaceDir, layout, 'libs', app ) : path.join( workspaceDir, 'libs', app );

	const appDir = layout ? path.join( appsDir, app ) : path.join( appsDir, app );
	const appSourceDir = path.join( appDir, 'src' );

	// Run the default Nx create workspace setup for angular
	execSync( `npx ${ npxForceInstall } create-nx-workspace@latest ${ workspace } --cli=nx --nx-cloud=false --preset=empty` );
	if ( layout ) {
		const nxPath = path.join( workspaceDir, 'nx.json' );
		const nxStr = await fse.readFile( nxPath, 'utf8' );
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const nxJson = JSON.parse( nxStr );
		_.set( nxJson, 'workspaceLayout.appsDir', `${ layout }/apps` );
		_.set( nxJson, 'workspaceLayout.libsDir', `${ layout }/libs` );
		await fse.outputFile( nxPath, JSON.stringify( nxJson, null, 2 )  );

		await fse.remove( path.join( workspaceDir, 'apps' ) );
		await fse.remove( path.join( workspaceDir, 'libs' ) );
	}

	execSync( 'npm install -D @nrwl/node @nrwl/angular @angular-devkit/architect', { cwd: workspaceDir } );
	execSync( `nx generate @nrwl/angular:app ${ app } --style=scss --routing=true --linter=eslint`, { cwd: workspaceDir } );
	runNCU( workspaceDir );

	// Add Angular Material
	execSync( 'npm install @angular/material', { cwd: workspaceDir } );
	execSync( 'nx generate @angular/material:ng-add --typography --animations', { cwd: workspaceDir } );

	// Setup Tailwind
	execSync( 'npm i -D @ngneat/tailwind@6.0.3 tailwindcss @tailwindcss/forms', { cwd: workspaceDir } );
	const workspaceStr = await fse.readFile( path.join( workspaceDir, 'workspace.json' ), 'utf8' );
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const workspaceJson = JSON.parse( workspaceStr );
	// build target

	//@angular-builders/custom-webpack Does not work with angular 12
	// execSync( 'npm install -D @angular-builders/custom-webpack', { cwd: workspaceDir } );
	// _.set( workspaceJson, `projects.${ app }.targets.build.executor`, '@angular-builders/custom-webpack:browser' );
	// _.set( workspaceJson, `projects.${ app }.targets.serve.executor`, '@angular-builders/custom-webpack:dev-server' );
	// _.set( workspaceJson, `projects.${ app }.targets.build.options.customWebpackConfig`, { path: 'webpack.config.js' } );
	// await renderToFile( path.join( 'webpack.config.js.ejs' ), path.join( workspaceDir, 'webpack.config.js' ), { workspace, app, _ } );

	_.set( workspaceJson, `projects.${ app }.targets.build.options.assets`, [ { glob: 'favicon.ico', input: `libs/${ app }/assets/src`, output: './' }, { glob: '**/*', input: `libs/${ app }/assets/src/assets`, output: 'assets' } ] );
	// serve target
	await fse.outputFile( path.join( workspaceDir, 'workspace.json' ), JSON.stringify( workspaceJson, null, 2 )  );
	await renderToFile( path.join( 'tailwind.config.js.ejs' ), path.join( workspaceDir, 'tailwind.config.js' ), { workspace, app, _ } );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'styles.css.ejs' ), path.join( appSourceDir, 'styles.scss' ), { workspace, app, _ } );

	runNCU( workspaceDir );

	await addAngularLocalize( workspaceDir, appSourceDir );

	//Add Angular FlexBox directives
	//execSync( 'npm install @angular/flex-layout@latest', { cwd: workspaceDir } );

	//Add NgRx
	execSync( `nx g ngrx app --root --no-interactive --project ${ app } --module ${ path.join( appsRelative, app, 'src', 'app', 'app.module.ts' ) }`, { cwd: workspaceDir } );
	execSync( 'npm install @ngrx/data', { cwd: workspaceDir } );

	// Setup Extra ESLint plugins
	execSync( 'npm install -D eslint-plugin-import eslint-plugin-prefer-arrow eslint-plugin-simple-import-sort', { cwd: workspaceDir } );

	// Add useful utility packages
	execSync( 'npm install await-to-js', { cwd: workspaceDir } );
	execSync( 'npm install ts-custom-error', { cwd: workspaceDir } );

	// Extended Jest Functionality
	execSync( 'npm install -D jest-chain jest-extended', { cwd: workspaceDir } );

	runNCU( workspaceDir );

	await adjustApp( workspaceDir, appDir, libsDir, workspace, app );
	await buildScaffoldForApp( workspaceDir, libsDir, workspace, app );
	await buildLayoutForApp( workspaceDir, libsDir, workspace, app );
	await buildMaterialForApp( workspaceDir, libsDir, workspace, app );

	// // Add Firebase
	// execSync( 'nx add @angular/fire@latest', { cwd: workspaceDir } );

	await renderToFile( path.join( 'vscode', 'extensions.json.ejs' ), path.join( workspaceDir, '.vscode', 'extensions.json' ), { workspace, app, _ } );
	await renderToFile( path.join( 'vscode', 'settings.json.ejs' ), path.join( workspaceDir, '.vscode', 'settings.json' ), { workspace, app, _ } );
	await renderToFile( path.join( 'editorconfig.ejs' ), path.join( workspaceDir, '.editorconfig' ), { workspace, app, _ } );
	await renderToFile( path.join( 'eslintrc.json.ejs' ), path.join( workspaceDir, '.eslintrc.json' ), { workspace, app, _ } );
	await renderToFile( path.join( 'jest.preset.js.ejs' ), path.join( workspaceDir, 'jest.preset.js' ), { workspace, app, _ } );
	const tsconfigBaseStr = await fse.readFile( path.join( workspaceDir, 'tsconfig.base.json' ), 'utf8' );
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const tsconfigBaseJSON = JSON.parse( tsconfigBaseStr );
	_.set( tsconfigBaseJSON, 'compilerOptions.forceConsistentCasingInFileNames', true );
	_.set( tsconfigBaseJSON, 'compilerOptions.strict', true );
	_.set( tsconfigBaseJSON, 'compilerOptions.noUnusedLocals', true );
	_.set( tsconfigBaseJSON, 'compilerOptions.noImplicitReturns', true );
	_.set( tsconfigBaseJSON, 'compilerOptions.noFallthroughCasesInSwitch', true );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.enableI18nLegacyMessageIdFormat', false );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.strictInjectionParameters', true );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.strictInputAccessModifiers', true );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.strictTemplates', true );
	await fse.outputFile( path.join( workspaceDir, 'tsconfig.base.json' ), JSON.stringify( tsconfigBaseJSON, null, 2 )  );

	execSync( 'nx run-many --target=lint --all --fix', { cwd: workspaceDir } );
	execSync( 'nx run-many --target=test --all', { cwd: workspaceDir } );
	execSync( 'nx build', { cwd: workspaceDir } );
}

void ( async () => {
	await main();
} )();

async function addAngularLocalize( workspaceDir: string, appSourceDir: string ) {
	execSync( 'npm install @angular/localize@latest', { cwd: workspaceDir } );
	const polyfillStr = await fse.readFile( path.join( appSourceDir, 'polyfills.ts' ), 'utf8' );
	const polyfill = `
/***************************************************************************************************
 * Load \`$localize\` onto the global scope - used if i18n tags appear in Angular templates.
 */
import '@angular/localize/init';

${ polyfillStr }
`;
	await fse.outputFile( path.join( appSourceDir, 'polyfills.ts' ), polyfill  );
}

async function adjustApp( workspaceDir: string, appDir: string, libsDir: string, workspace: string, app: string ) {
	const appSourceDir = path.join( appDir, 'src' );
	const appModuleDir = path.join( appSourceDir, 'app' );

	await fse.remove( path.join( appModuleDir, 'app.component.html' ) );
	await fse.remove( path.join( appModuleDir, 'app.component.scss' ) );
	await fse.remove( path.join( appModuleDir, 'app.component.spec.ts' ) );
	await fse.remove( path.join( appSourceDir, 'environments' ) );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'app', 'app.component.ts.ejs' ), path.join( appModuleDir, 'app.component.ts' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'app', 'app.module.ts.ejs' ), path.join( appModuleDir, 'app.module.ts' ), { workspace, app, _ } );
	const mainTs = await fse.readFile( path.join( appSourceDir, 'main.ts' ), 'utf8' );
	await fse.outputFile( path.join( appSourceDir, 'main.ts' ), mainTs.replace( './environments/environment', `@${ workspace }/${ app }/scaffold` ) );

	const workspaceStr = await fse.readFile( path.join( workspaceDir, 'workspace.json' ), 'utf8' );
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const workspaceJson = JSON.parse( workspaceStr );
	// build target
	const toLibs = path.relative( workspaceDir, libsDir );
	_.set( workspaceJson, `projects.${ app }.targets.build.configurations.production.fileReplacements.0.replace`, path.join( toLibs, 'scaffold', 'src', 'environments', 'environment.ts' ) );
	_.set( workspaceJson, `projects.${ app }.targets.build.configurations.production.fileReplacements.0.with`, path.join( toLibs, 'scaffold', 'src', 'environments', 'environment.prod.ts' ) );
	await fse.outputFile( path.join( workspaceDir, 'workspace.json' ), JSON.stringify( workspaceJson, null, 2 )  );
}

async function buildScaffoldForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const scaffoldDir = path.join( libsDir, 'scaffold' );
	const scaffoldSrcDir = path.join( scaffoldDir, 'src' );
	const scaffoldSrcLibDir = path.join( scaffoldSrcDir, 'lib' );

	execSync( `nx g @nrwl/angular:lib ${ app }/scaffold --prefix=${ app }`, { cwd: workspaceDir } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'environments', 'environment.prod.ts.ejs' ), path.join( scaffoldSrcDir, 'environments', 'environment.prod.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'environments', 'environment.ts.ejs' ), path.join( scaffoldSrcDir, 'environments', 'environment.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'lib', 'ngrx.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'ngrx.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'lib', 'routing.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'routing.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'lib', 'scaffold.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'scaffold.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'index.ts.ejs' ), path.join( scaffoldSrcDir, 'index.ts' ), { workspace, app, _ } );

	// Not Found
	const notFoundTemplateDir = path.join( 'libs', 'scaffold', 'src', 'lib', 'not-found' );
	await renderToFile( path.join( notFoundTemplateDir, 'not-found.component.spec.ts.ejs' ), path.join( scaffoldSrcLibDir, 'not-found', 'not-found.component.spec.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( notFoundTemplateDir, 'not-found.component.ts.ejs' ), path.join( scaffoldSrcLibDir, 'not-found', 'not-found.component.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( notFoundTemplateDir, 'not-found.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'not-found', 'not-found.module.ts' ), { workspace, app, _ } );

	await fse.remove( path.join( scaffoldSrcLibDir, `${ app }-scaffold.module.ts` ) );
}

async function buildLayoutForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const layoutDir = path.join( libsDir, 'layout' );
	const layoutSrcDir = path.join( layoutDir, 'src' );
	const layoutSrcLibDir = path.join( layoutSrcDir, 'lib' );

	const layoutTemplateDir = path.join( 'libs', 'layout', 'src' );

	execSync( `nx g @nrwl/angular:lib ${ app }/layout --prefix=${ app }`, { cwd: workspaceDir } );
	execSync( `nx g @nrwl/angular:component ${ app }-layout --inlineStyle --inlineTemplate --skipTests --flat --project=${ app }-layout --prefix=${ app }`, { cwd: workspaceDir } )
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'layout.component.ts.ejs' ), path.join( layoutSrcLibDir, `${ app }-layout.component.ts` ), { workspace, app, _ } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'layout.module.ts.ejs' ), path.join( layoutSrcLibDir, `${ app }-layout.module.ts` ), { workspace, app, _ } );
	await renderToFile( path.join( layoutTemplateDir, 'index.ts.ejs' ), path.join( layoutSrcDir, 'index.ts' ), { workspace, app, _ } );

	const stateTemplateDir = path.join( layoutTemplateDir, 'lib', '+state', 'layout' );
	const stateSrcDir = path.join( layoutSrcLibDir, '+state', 'layout' );
	await renderToFile( path.join( stateTemplateDir, 'layout.actions.ts.ejs' ), path.join( stateSrcDir, 'layout.actions.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( stateTemplateDir, 'layout.reducer.ts.ejs' ), path.join( stateSrcDir, 'layout.reducer.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( stateTemplateDir, 'layout.selectors.ts.ejs' ), path.join( stateSrcDir, 'layout.selectors.ts' ), { workspace, app, _ } );

	execSync( `nx g @nrwl/angular:module components/layout-header --project ${ app }-layout`, { cwd: workspaceDir }  );
	execSync( `nx g @nrwl/angular:component components/layout-header --inlineStyle --inlineTemplate --skipTests --project=${ app }-layout --prefix=${ app }`, { cwd: workspaceDir } );
	await renderToFile( path.join( 'angular', 'component', 'module-for-component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-header', 'layout-header.module.ts' ), { workspace, app, _, component: 'layout-header' } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'components', 'layout-header', 'layout-header.component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-header', 'layout-header.component.ts' ), { workspace, app, _ } );

	execSync( `nx g @nrwl/angular:module components/layout-footer --project ${ app }-layout`, { cwd: workspaceDir }  );
	execSync( `nx g @nrwl/angular:component components/layout-footer --inlineStyle --inlineTemplate --skipTests --project=${ app }-layout --prefix=${ app }`, { cwd: workspaceDir } );
	await renderToFile( path.join( 'angular', 'component', 'module-for-component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-footer', 'layout-footer.module.ts' ), { workspace, app, _, component: 'layout-footer' } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'components', 'layout-footer', 'layout-footer.component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-footer', 'layout-footer.component.ts' ), { workspace, app, _ } );
}

async function buildMaterialForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const materialDir = path.join( libsDir, 'material' );
	const materialSrcDir = path.join( materialDir, 'src' );
	const materialSrcLibDir = path.join( materialSrcDir, 'lib' );

	const materialTemplateDir = path.join( 'libs', 'material', 'src' );

	execSync( `nx g @nrwl/angular:lib ${ app }/material --prefix=${ app }`, { cwd: workspaceDir } );
	await renderToFile( path.join( materialTemplateDir, 'lib', 'material.module.ts.ejs' ), path.join( materialSrcLibDir, 'material.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( materialTemplateDir, 'index.ts.ejs' ), path.join( materialSrcDir, 'index.ts' ), { workspace, app, _ } );
	await fse.remove( path.join( materialSrcLibDir, `${ app }-material.module.ts` ) );
}

function execSync( command: string, options?: child.ExecSyncOptions ): Buffer {
	if ( options?.stdio !== 'ignore' ) {
		console.log( chalk.gray( command ) );
	}
	return child.execSync( command, { stdio: options?.stdio ?? 'inherit', cwd: options?.cwd } );
}

async function renderToFile( relativeTemplatePath: string, outputPath: string, data?: ejs.Data ) {
	const templatePath = path.join( templateDir, relativeTemplatePath );
	const output = await ejs.renderFile( templatePath, data ?? {}, { async: true } );
	await fse.outputFile( outputPath, output );
}

function execSyncCapture( command: string, options?: child.ExecSyncOptions ): Promise< { code: number | null, err: child.ExecException | null, stdOut: string, stdErr: string } > {
	if ( options?.stdio !== 'ignore' ) {
		console.log( chalk.gray( command ) );
	}

	return new Promise( ( resolve ) => {
		let stdOut = '';
		let stdErr = '';
		let e: child.ExecException | null = null;
		child.exec( command, ( err, stdout, stderr ) => {
			stdOut += stdout;
			stdErr += stderr;
			e = err;
		} ).on( 'close', ( code ) =>  {
			resolve( { code, err: e, stdOut, stdErr } )
		} )
	} );
}
