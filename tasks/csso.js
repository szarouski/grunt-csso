/*
 * grunt-csso
 * http://github.com/t32k/grunt-csso
 *
 * Copyright (c) 2013 Koji Ishimoto
 * Licensed under the MIT license.
 */
'use strict';

module.exports = (grunt) => {
  const fs = require('fs');
  const path = require('path');
  const csso = require('csso');
  const chalk = require('chalk');
  const maxmin = require('maxmin');
  const async = require('async');

  grunt.registerMultiTask('csso', 'Minify CSS files with CSSO.', function () {
    const now = () => (new Date()).getTime();
    const options = this.options({
      restructure: true,
      banner: '',
      report: false,
      debug: false,
      beforeCompress: null,
      afterCompress: null,
      encoding: grunt.file.defaultEncoding
    });
    const done = (() => {
      const start = now();
      const done = this.async();
      return () => {
        if (options.report) {
          grunt.log.writeln('Executed in %d ms', now() - start);
        }
        return done();
      };
    })();
    // Process banner.
    const banner = grunt.template.process(options.banner);
    // Plugin wrapper
    const wrapPlugins = (plugins) => {
      const wrapPlugin = (plugin) => (res, options) => {
        return plugin(res, options, csso);
      };
      if (Array.isArray(plugins)) {
        return plugins.map(wrapPlugin);
      }
      if (typeof plugins === 'function') {
        return [wrapPlugin(plugins)];
      }
      return undefined;
    };
    const proceed = (original, dest, next) => {
      let proceed = '';
      try {
        proceed = csso.minify(original, {
          restructure: options.restructure,
          debug: options.debug,
          beforeCompress: wrapPlugins(options.beforeCompress),
          afterCompress: wrapPlugins(options.afterCompress)
        }).css;
      }
      catch (err) {
        return next(err);
      }

      if (proceed.length === 0) {
        grunt.log.warn('Destination is not created because minified CSS was empty.');
        next();
      } else {
        // add banner.
        proceed = banner + proceed;
        // create all intermediate folders
        grunt.file.write(dest, '');
        // actually write the file
        fs.writeFile(dest, proceed, options.encoding, (err) => {
          if (err) {
            return next(err);
          }
          grunt.log.write('File ' + chalk.cyan(dest) + ' created' + (options.report ? ': ' : '.'));
          if (options.report) {
            grunt.log.write(maxmin(original, proceed, options.report === 'gzip'));
          }
          grunt.log.writeln();
          next();
        });
      }
    };

    async.each(this.files, (file, next) => {
      const dest = file.dest || file.src[0];

      // 1. Check file extension
      const css = file.src.filter((p) => {
        if (path.extname(p) !== '.css') {
          grunt.log.warn('Source file "' + p + '" is not css.');
          return false;
        }
        return true;
      });

      // 2. Check existence
      async.filter(css, (p, next) => fs.access(p, fs.R_OK, (err) => {
        if (err) {
          grunt.log.warn('Source file "' + p + '" is not found or not readable.');
        }
        next(err, !err);
      }), (err, existing) => {
        if (err) {
          return next(err);
        }
        // 3. Load and concatenate css files
        async.reduce(existing, '', (buffer, stylesheet, next) => {
          fs.readFile(stylesheet, options.encoding, (err, file) => {
            if (err) {
              return next(err);
            }
            next(null, buffer + file);
          });
        }, (err, original) => {
          if (err) {
            return next(err);
          }
          // 4. proceed
          proceed(original, dest, next);
        });
      });
    }, (err) => {
      if (err) {
        let msg = err.message;
        if (!!err.parseError) {
          msg += '  (' + err.parseError.line + ')'
        }
        grunt.fail.fatal(msg);
      }
      done();
    });
  });
};
