#!/usr/bin/env node
const process = require('node:process');
const handleCommands=require('./utilities/handlecommands')
handleCommands(process.argv);