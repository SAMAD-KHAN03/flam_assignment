#!/usr/bin/env node --experimental-sqlite
const process = require('node:process');
process.env.NODE_OPTIONS = '--disable-warning=ExperimentalWarning';

const handleCommands=require('./utilities/handlecommands')
handleCommands(process.argv);