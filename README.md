# `> npx create-material-angular-workspace`

[![npm](https://img.shields.io/npm/v/create-material-angular-workspace?color=blue&logo=npm&style=flat-square)](https://www.npmjs.com/package/create-material-angular-workspace)

> Builds a preconfigured Angular workspace using Nx with Angular Material and NgRx

Creates an [Nx Workspace](https://nx.dev/) that is preconfigured for

-   [Angular Material](https://material.angular.io/)
-   [Angular Flexbox](https://github.com/angular/flex-layout)
    -   Helpful documentation at [A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
-   [NgRx](https://ngrx.io/)

Note: It also updates all packages to the latest version

# Getting Started

## Creating an Nx Angular Workspace with Angular Material and NgRx

### Using npx

```
npx create-material-angular-workspace
```

The `create-material-angular-workspace` command will ask you to select the workspace and application names.

```
? Workspace name (e.g., org name)     exampleorg
? Application name                    my-material-app
```

## Serving Application

-   Run `nx serve` to serve the newly generated application!
-   Run `nx test` to test it.
-   Run `nx e2e` to run e2e tests for it.
