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
	const result = await execSyncCapture( 'npx --ignore-existing __' );
	if ( result.stdErr.includes( '--ignore-existing argument has been removed' ) ) {
		npxForceInstall = '--yes'
	}
}

function runNCU( workspaceDir: string ) {
	const excluded = [
		'jest',
		'jest-environment-jsdom',
		'ts-jest',
		'typescript',
		'zone.js',
		'tslib',
	]

	const excludes = excluded.join( ',' );

	execSync( `npx ${ npxForceInstall } npm-check-updates@latest -x "${ excludes }" -u`, { cwd: workspaceDir } );
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
	const theme = '';

	// const workspace = 'dropfake';
	// const app = 'admin';
	// const layout = 'web';
	// const theme = 'deeppurple-amber';

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
		_.set( nxJson, 'defaultProject', 'admin' );
		await fse.outputFile( nxPath, JSON.stringify( nxJson, null, 2 )  );

		await fse.remove( path.join( workspaceDir, 'apps' ) );
		await fse.remove( path.join( workspaceDir, 'libs' ) );
	}

	execSync( 'npm install -D @nrwl/node @nrwl/angular @angular-devkit/architect', { cwd: workspaceDir } );
	execSync( `nx generate @nrwl/angular:app ${ app } --style=scss --routing=true --linter=eslint --standalone=false`, { cwd: workspaceDir } );
	runNCU( workspaceDir );

	// Add Angular Material
	execSync( 'npm install @angular/material', { cwd: workspaceDir } );
	let materialCmd = `nx generate @angular/material:ng-add --typography --animations=enabled --project=${ app }`;
	if ( theme ) {
		materialCmd += ` --theme=${ theme }`;
	}
	execSync( materialCmd, { cwd: workspaceDir } );

	// Setup Tailwind
	execSync( `nx g @nrwl/angular:setup-tailwind --project=${ app }`, { cwd: workspaceDir } );

	runNCU( workspaceDir );

	addAngularLocalize( workspaceDir, appSourceDir );

	//Add NgRx
	execSync( `nx g @nrwl/angular:ngrx app --parent=${ path.join( appsRelative, app, 'src', 'app', 'app.module.ts' ) } --root --no-interactive`, { cwd: workspaceDir } );
	runNCU( workspaceDir );
	execSync( 'npm install @ngrx/data', { cwd: workspaceDir } );

	// Setup Extra ESLint plugins
	execSync( 'npm install -D eslint-plugin-import eslint-plugin-prefer-arrow eslint-plugin-simple-import-sort eslint-plugin-ngrx eslint-plugin-rxjs', { cwd: workspaceDir } );

	// Add useful utility packages
	execSync( 'npm install await-to-js', { cwd: workspaceDir } );
	execSync( 'npm install lodash', { cwd: workspaceDir } );
	execSync( 'npm install -D @types/lodash', { cwd: workspaceDir } );
	execSync( 'npm install ts-custom-error', { cwd: workspaceDir } );
	execSync( 'npm install ts-mixer', { cwd: workspaceDir } );


	// Extended Jest Functionality
	execSync( 'npm install -D jest-chain jest-extended', { cwd: workspaceDir } );

	runNCU( workspaceDir );

	await adjustApp( workspaceDir, appDir, libsDir, layout, workspace, app );
	await buildScaffoldForApp( workspaceDir, libsDir, workspace, app );
	await buildLayoutForApp( workspaceDir, libsDir, workspace, app );
	await buildMaterialForApp( workspaceDir, libsDir, workspace, app );
	await buildAuthForApp( workspaceDir, libsDir, workspace, app );
	await buildDashboardForApp( workspaceDir, libsDir, workspace, app );

	// Add Firebase
	execSync( 'npm install @angular/fire firebase firebaseui firebaseui-angular', { cwd: workspaceDir } );

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
	_.set( tsconfigBaseJSON, 'compilerOptions.allowSyntheticDefaultImports', true );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.enableI18nLegacyMessageIdFormat', false );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.strictInjectionParameters', true );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.strictInputAccessModifiers', true );
	_.set( tsconfigBaseJSON, 'angularCompilerOptions.strictTemplates', true );
	await fse.outputFile( path.join( workspaceDir, 'tsconfig.base.json' ), JSON.stringify( tsconfigBaseJSON, null, 2 )  );

	execSync( 'nx format', { cwd: workspaceDir } );

	execSync( 'nx run-many --target=lint --all --fix --parallel --maxParallel=8', { cwd: workspaceDir } );
	execSync( 'nx run-many --target=test --all', { cwd: workspaceDir } );
	execSync( `nx build ${ app }`, { cwd: workspaceDir } );
}

void ( async () => {
	await main();
} )();

function addAngularLocalize( workspaceDir: string, appSourceDir: string ) {
	execSync( 'npm install @angular/localize@latest', { cwd: workspaceDir } );
	// 	const polyfillStr = await fse.readFile( path.join( appSourceDir, 'polyfills.ts' ), 'utf8' );
	// 	const polyfill = `
	// /***************************************************************************************************
	//  * Load \`$localize\` onto the global scope - used if i18n tags appear in Angular templates.
	//  */
	// import '@angular/localize/init';

// ${ polyfillStr }
// `;
// 	await fse.outputFile( path.join( appSourceDir, 'polyfills.ts' ), polyfill  );
}

async function adjustApp( workspaceDir: string, appDir: string, libsDir: string, layout: string, workspace: string, app: string ) {
	const appSourceDir = path.join( appDir, 'src' );

	const appModuleDir = path.join( appSourceDir, 'app' );
	await fse.remove( path.join( appModuleDir, 'app.component.html' ) );
	await fse.remove( path.join( appModuleDir, 'app.component.scss' ) );
	await fse.remove( path.join( appModuleDir, 'app.component.spec.ts' ) );
	await fse.remove( path.join( appModuleDir, 'nx-welcome.component.ts' ) );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'app', 'app.component.ts.ejs' ), path.join( appModuleDir, 'app.component.ts' ), { layout, workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'app', 'app.module.ts.ejs' ), path.join( appModuleDir, 'app.module.ts' ), { workspace, app, _ } );

	const environmentsDir = path.join( appSourceDir, 'environments' );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'environments', 'environment.prod.ts.ejs' ), path.join( environmentsDir, 'environment.prod.ts' ), { workspace, app } );
	await renderToFile( path.join( 'apps', '<app>', 'src', 'environments', 'environment.ts.ejs' ), path.join( environmentsDir, 'environment.ts' ), { workspace, app, _ } );

	await renderToFile( path.join( 'apps', '<app>', 'src', 'styles.scss.ejs' ), path.join( appSourceDir, 'styles.scss' ), { workspace, app, _ } );

	let indexStr = await fse.readFile( path.join( appSourceDir, 'index.html' ), 'utf8' );
	indexStr = indexStr.split( `${ workspace }-root` ).join( `${ workspace }-${ app }-root` );
	await fse.outputFile( path.join( appSourceDir, 'index.html' ), indexStr );


	const projectStr = await fse.readFile( path.join( appDir, 'project.json' ), 'utf8' );
	const projectJson = JSON.parse( projectStr ); // eslint-disable-line @typescript-eslint/no-unsafe-assignment

	const styles: string[] = _.get( projectJson, 'targets.build.options.styles' ); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
	styles.push( './node_modules/firebaseui/dist/firebaseui.css' );
	_.set( projectJson, 'targets.build.options.styles', styles );
	_.set( projectJson, 'targets.build.configurations.production.budgets.0.maximumWarning', '1.2mb' );
	_.set( projectJson, 'targets.build.configurations.production.budgets.0.maximumError', '2mb' );

	await fse.outputFile( path.join( appDir, 'project.json' ), JSON.stringify( projectJson, null, 2 )  );

	// Fixup .eslintrc.json
	const eslintrcStr = await fse.readFile( path.join( appDir, '.eslintrc.json' ), 'utf8' );
	const eslintrcJson = JSON.parse( eslintrcStr ); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
	_.set( eslintrcJson, 'overrides.0.parserOptions.project', [ path.join( path.relative( workspaceDir, appDir ), 'tsconfig.*?.json' ) ] );
	await fse.outputFile( path.join( appDir, '.eslintrc.json' ), JSON.stringify( eslintrcJson, null, 2 )  );

	const e2eDir = `${ appDir  }-e2e`;
	const eslintrcE2EStr = await fse.readFile( path.join( e2eDir, '.eslintrc.json' ), 'utf8' );
	const eslintrcE2EJson = JSON.parse( eslintrcE2EStr ); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
	_.set( eslintrcE2EJson, 'overrides.0.parserOptions.project', [ path.join( path.relative( workspaceDir, e2eDir ), 'tsconfig.json' ) ] );
	await fse.outputFile( path.join( e2eDir, '.eslintrc.json' ), JSON.stringify( eslintrcE2EJson, null, 2 )  );
}

async function buildScaffoldForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const scaffoldDir = path.join( libsDir, 'scaffold' );
	const scaffoldSrcDir = path.join( scaffoldDir, 'src' );
	const scaffoldSrcLibDir = path.join( scaffoldSrcDir, 'lib' );

	execSync( `nx g @nrwl/angular:lib ${ app }/scaffold --prefix=${ app }`, { cwd: workspaceDir } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'lib', 'ngrx.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'ngrx.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'lib', 'routing.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'routing.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'lib', 'scaffold.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'scaffold.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( 'libs', 'scaffold', 'src', 'index.ts.ejs' ), path.join( scaffoldSrcDir, 'index.ts' ), { workspace, app, _ } );

	// Not Found
	const notFoundTemplateDir = path.join( 'libs', 'scaffold', 'src', 'lib', 'not-found' );
	await renderToFile( path.join( notFoundTemplateDir, 'not-found.component.ts.ejs' ), path.join( scaffoldSrcLibDir, 'not-found', 'not-found.component.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( notFoundTemplateDir, 'not-found.module.ts.ejs' ), path.join( scaffoldSrcLibDir, 'not-found', 'not-found.module.ts' ), { workspace, app, _ } );

	await fse.remove( path.join( scaffoldSrcLibDir, `${ app }-scaffold.module.ts` ) );

	// Fixup .eslintrc.json
	const eslintrcStr = await fse.readFile( path.join( scaffoldDir, '.eslintrc.json' ), 'utf8' );
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const eslintrcJson = JSON.parse( eslintrcStr );
	_.set( eslintrcJson, 'overrides.0.parserOptions.project', [ path.join( path.relative( workspaceDir, libsDir ), 'scaffold', 'tsconfig.*?.json' ) ] );
	await fse.outputFile( path.join( scaffoldDir, '.eslintrc.json' ), JSON.stringify( eslintrcJson, null, 2 )  );
}

async function buildLayoutForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const layoutDir = path.join( libsDir, 'layout' );
	const layoutSrcDir = path.join( layoutDir, 'src' );
	const layoutSrcLibDir = path.join( layoutSrcDir, 'lib' );

	const layoutTemplateDir = path.join( 'libs', 'layout', 'src' );

	execSync( `nx g @nrwl/angular:lib ${ app }/layout --prefix=${ app }`, { cwd: workspaceDir } );
	execSync( `nx g @nrwl/angular:component ${ app }-layout --inlineStyle --inlineTemplate --skipTests --flat --project=${ app }-layout`, { cwd: workspaceDir } )
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'layout.component.ts.ejs' ), path.join( layoutSrcLibDir, `${ app }-layout.component.ts` ), { workspace, app, _ } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'layout.module.ts.ejs' ), path.join( layoutSrcLibDir, `${ app }-layout.module.ts` ), { workspace, app, _ } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'sidenav.ts.ejs' ), path.join( layoutSrcLibDir, 'sidenav.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( layoutTemplateDir, 'index.ts.ejs' ), path.join( layoutSrcDir, 'index.ts' ), { workspace, app, _ } );

	const stateTemplateDir = path.join( layoutTemplateDir, 'lib', '+state', 'layout' );
	const stateSrcDir = path.join( layoutSrcLibDir, '+state', 'layout' );
	await renderToFile( path.join( stateTemplateDir, 'layout.actions.ts.ejs' ), path.join( stateSrcDir, 'layout.actions.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( stateTemplateDir, 'layout.effects.ts.ejs' ), path.join( stateSrcDir, 'layout.effects.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( stateTemplateDir, 'layout.reducer.ts.ejs' ), path.join( stateSrcDir, 'layout.reducer.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( stateTemplateDir, 'layout.selectors.ts.ejs' ), path.join( stateSrcDir, 'layout.selectors.ts' ), { workspace, app, _ } );

	execSync( `nx g @nrwl/angular:module components/layout-header --project ${ app }-layout`, { cwd: workspaceDir }  );
	execSync( `nx g @nrwl/angular:component components/layout-header --inlineStyle --inlineTemplate --skipTests --project=${ app }-layout`, { cwd: workspaceDir } );
	await renderToFile( path.join( 'angular', 'component', 'module-for-component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-header', 'layout-header.module.ts' ), { workspace, app, _, component: 'layout-header' } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'components', 'layout-header', 'layout-header.component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-header', 'layout-header.component.ts' ), { workspace, app, _ } );

	execSync( `nx g @nrwl/angular:module components/layout-footer --project ${ app }-layout`, { cwd: workspaceDir }  );
	execSync( `nx g @nrwl/angular:component components/layout-footer --inlineStyle --inlineTemplate --skipTests --project=${ app }-layout`, { cwd: workspaceDir } );
	await renderToFile( path.join( 'angular', 'component', 'module-for-component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-footer', 'layout-footer.module.ts' ), { workspace, app, _, component: 'layout-footer' } );
	await renderToFile( path.join( layoutTemplateDir, 'lib', 'components', 'layout-footer', 'layout-footer.component.ts.ejs' ), path.join( layoutSrcLibDir, 'components', 'layout-footer', 'layout-footer.component.ts' ), { workspace, app, _ } );

	// Fixup .eslintrc.json
	const eslintrcStr = await fse.readFile( path.join( layoutDir, '.eslintrc.json' ), 'utf8' );
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const eslintrcJson = JSON.parse( eslintrcStr );
	_.set( eslintrcJson, 'overrides.0.parserOptions.project', [ path.join( path.relative( workspaceDir, libsDir ), 'layout', 'tsconfig.*?.json' ) ] );
	await fse.outputFile( path.join( layoutDir, '.eslintrc.json' ), JSON.stringify( eslintrcJson, null, 2 )  );
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

	await fixupEslintrc( workspaceDir, libsDir, materialDir, 'material' );
}

async function fixupEslintrc( workspaceDir: string, libsDir: string, libDir: string, name: string ) {
	const relativeDir = path.relative( workspaceDir, libsDir );
	const eslintrcStr = await fse.readFile( path.join( libDir, '.eslintrc.json' ), 'utf8' );
	const eslintrcJson = JSON.parse( eslintrcStr ); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
	_.set( eslintrcJson, 'overrides.0.parserOptions.project', [ path.join( relativeDir, name, 'tsconfig.*?.json' ) ] );
	await fse.outputFile( path.join( libDir, '.eslintrc.json' ), JSON.stringify( eslintrcJson, null, 2 )  );
}

async function buildAuthForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const authDir = path.join( libsDir, 'auth' );
	const authSrcDir = path.join( authDir, 'src' );
	const authSrcLibDir = path.join( authSrcDir, 'lib' );

	const authTemplateDir = path.join( 'libs', 'auth', 'src' );

	// Setup the auth
	execSync( `nx g @nrwl/angular:lib ${ app }/auth --prefix=${ app }`, { cwd: workspaceDir } );
	execSync( `nx g @nrwl/angular:component  components/auth-form --inlineStyle --inlineTemplate --skipTests --project=${ app }-auth`, { cwd: workspaceDir } )
	await renderToFile( path.join( authTemplateDir, 'lib', 'components', 'auth-form', 'auth-form.component.ts.ejs' ), path.join( authSrcLibDir, 'components', 'auth-form', 'auth-form.component.ts' ), { workspace, app, _ } );

	execSync( `nx g @nrwl/angular:module components/logout --project ${ app }-auth`, { cwd: workspaceDir }  );
	await renderToFile( path.join( authTemplateDir, 'lib', 'components', 'logout', 'logout.module.ts.ejs' ), path.join( authSrcLibDir, 'components', 'logout', 'logout.module.ts' ), { workspace, app, _ } );
	execSync( `nx g @nrwl/angular:component  components/logout --inlineStyle --inlineTemplate --skipTests --project=${ app }-auth`, { cwd: workspaceDir } )
	await renderToFile( path.join( authTemplateDir, 'lib', 'components', 'logout', 'logout.component.ts.ejs' ), path.join( authSrcLibDir, 'components', 'logout', 'logout.component.ts' ), { workspace, app, _ } );

	// Setup NgRx for Auth
	await renderToFile( path.join( authTemplateDir, 'lib', '+state', 'auth', 'auth.actions.ts.ejs' ), path.join( authSrcLibDir, '+state', 'auth', 'auth.actions.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( authTemplateDir, 'lib', '+state', 'auth', 'auth.effects.ts.ejs' ), path.join( authSrcLibDir, '+state', 'auth', 'auth.effects.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( authTemplateDir, 'lib', '+state', 'auth', 'auth.reducer.ts.ejs' ), path.join( authSrcLibDir, '+state', 'auth', 'auth.reducer.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( authTemplateDir, 'lib', '+state', 'auth', 'auth.selectors.ts.ejs' ), path.join( authSrcLibDir, '+state', 'auth', 'auth.selectors.ts' ), { workspace, app, _ } );

	// Setup Services for Auth
	await renderToFile( path.join( authTemplateDir, 'lib', 'admin-auth.module.ts.ejs' ), path.join( authSrcLibDir, 'admin-auth.module.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( authTemplateDir, 'lib', 'auth.service.ts.ejs' ), path.join( authSrcLibDir, 'auth.service.ts' ), { workspace, app, _ } );
	await renderToFile( path.join( authTemplateDir, 'lib', 'is-logged-in.guard.ts.ejs' ), path.join( authSrcLibDir, 'is-logged-in.guard.ts' ), { workspace, app, _ } );

	await renderToFile( path.join( authTemplateDir, 'index.ts.ejs' ), path.join( authSrcDir, 'index.ts' ), { workspace, app, _ } );

	await fixupEslintrc( workspaceDir, libsDir, authDir, 'auth' );
}

async function buildDashboardForApp( workspaceDir: string, libsDir: string, workspace: string, app: string ) {
	const dashboardDir = path.join( libsDir, 'dashboard' );
	const dashboardSrcDir = path.join( dashboardDir, 'src' );
	const dashboardSrcLibDir = path.join( dashboardSrcDir, 'lib' );

	const dashboardTemplateDir = path.join( 'libs', 'dashboard', 'src' );

	// Setup the auth
	execSync( `nx g @nrwl/angular:lib ${ app }/dashboard --prefix=${ app }`, { cwd: workspaceDir } );

	execSync( `nx g @nrwl/angular:component ${ app }-dashboard --inlineStyle --inlineTemplate --skipTests --flat --project=${ app }-dashboard`, { cwd: workspaceDir } )
	await renderToFile( path.join( dashboardTemplateDir, 'lib', 'admin-dashboard.component.ts.ejs' ), path.join( dashboardSrcLibDir, 'admin-dashboard.component.ts' ), { workspace, app, _ } );

	await renderToFile( path.join( dashboardTemplateDir, 'lib', 'admin-dashboard.module.ts.ejs' ), path.join( dashboardSrcLibDir, 'admin-dashboard.module.ts' ), { workspace, app, _ } );

	await fixupEslintrc( workspaceDir, libsDir, dashboardDir, 'dashboard' );
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
