'use strict';
var gulp = require('gulp');
var sass = require('gulp-sass');
var autoprefixer = require('gulp-autoprefixer');
var browserSync = require('browser-sync').create();
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var babel = require('gulp-babel');
var babelify = require('babelify');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var transform = require('vinyl-transform');
var buffer = require('vinyl-buffer');
var polyfill = require("babel-polyfill");
var gutil = require('gulp-util');
var ascjsify = require('ascjsify');
var sourcemaps = require('gulp-sourcemaps');
var log = require('gulplog');
var minifyjs = require('gulp-js-minify');
var minifyHTML = require( 'gulp-htmlmin' );
var rename = require("gulp-rename");
var uglify = require('gulp-uglify-es').default;
var cleanCSS = require('gulp-clean-css');
var injectCSS = require('gulp-inject-css');
 
var options = {
    toplevel: true,
    compress: {
        passes: 2
    },
    output: {
        beautify: false,
        preamble: "/* uglified */"
    }
};

gulp.task('default', ['copy-html', 'copy-sw', 'copy-images', 'copy-icons', 'scripts-dist','scripts-restaurant-dist'], function () {
	return true;
});

gulp.task('scripts-dist', function () {
	gulp.src(['./js/idb.js','./js/dbhelper.js', './js/Dialog.js','./js/main.js', './js/swhelper.js'])
		//.pipe(babel())
		.pipe(concat('app.js'))
		.pipe(rename("app.js"))
		.pipe(uglify(options))
		.pipe(gulp.dest('dist/js'));

	gulp.src(['./js/idb.js', './js/dbhelper.js'])
		.pipe(gulp.dest('dist/js'));
		
});
gulp.task('scripts-restaurant-dist', function () {
	gulp.src(['./js/idb.js', './js/dbhelper.js', './js/Dialog.js','./js/restaurant_info.js', './js/swhelper.js'])
		.pipe(concat('restaurant.js'))
		.pipe(rename("restaurant.js"))
		//.pipe(uglify(options))
		.pipe(gulp.dest('dist/js'));

	gulp.src(['./js/idb.js', './js/dbhelper.js'])
		.pipe(gulp.dest('dist/js'));
});

gulp.task('copy-html',['styles'], function () {
	gulp.src(['./index.html', './restaurant.html', './robots.txt'])
	.pipe(injectCSS())
	.pipe( minifyHTML( {
		removeComments : true ,
		collapseWhitespace : true
	} ) )
	.pipe(gulp.dest('./dist'));
});
gulp.task('copy-sw', function () {
	gulp.src(['./sw.js','./favicon.svg','./manifest.json'])
		.pipe(gulp.dest('./dist'));
});
gulp.task('copy-images', function () {
	gulp.src(['img/*.webp', 'img/*.svg'])
		.pipe(gulp.dest('dist/img'));
});
gulp.task('copy-icons', function () {
	gulp.src('icons/*.*')
		.pipe(gulp.dest('dist/icons'));
});


gulp.task('styles', function (done) {
	return gulp.src('sass/all.scss')
		.pipe(sass({
			outputStyle: 'compressed'
		}).on('error', sass.logError))
		.pipe(autoprefixer({
			browsers: ['last 2 versions']
		}))
		.pipe(cleanCSS({
			level: {
			  1: {
				all: true,
				normalizeUrls: false
			  },
			  2: {
				restructureRules: true
			  }
			}
		  }))
		.pipe(gulp.dest('dist/css'))
		done();
});

