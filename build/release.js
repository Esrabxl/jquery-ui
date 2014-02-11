module.exports = function( Release ) {

var shell = require( "shelljs" ),
	path = require( "path" );

function walk( methods ) {
	var method = methods.shift();

	function next() {
		if ( methods.length ) {
			walk( methods );
		}
	}

	if ( !method.length ) {
		method();
		next();
	} else {
		method( next );
	}
}

function buildPreReleasePackage( callback ) {
	var builder, files, jqueryUi, packer, target, targetZip,
		downloadBuilder = require( "download.jqueryui.com" );
	jqueryUi = new downloadBuilder.JqueryUi( path.resolve( "." ) );
	builder = new downloadBuilder.Builder( jqueryUi, ":all:" );
	packer = new downloadBuilder.Packer( builder, null, {
		addTests: true,
		bundleSuffix: "",
		skipDocs: true,
		skipTheme: true
	});
	target = "../" + jqueryUi.pkg.name + "-" + jqueryUi.pkg.version;
	targetZip = target + ".zip";

	walk([
		function( next ) {
			console.log( "Building release files" );
			packer.pack(function( error, _files ) {
				if ( error ) {
					Release.abort( error.stack );
				}
				files = _files.map(function( file ) {

					// Strip first path
					file.path = file.path.replace( /^[^\/]*\//, "" );
					return file;

				}).filter(function( file ) {

					// Filter development-bundle content only
					return (/^development-bundle/).test( file.path );
				}).map(function( file ) {

					// Strip development-bundle
					file.path = file.path.replace( /^development-bundle\//, "" );
					return file;

				});
				return next();
			});
		},
		function() {
			downloadBuilder.util.createZip( files, targetZip, function( error ) {
				if ( error ) {
					Release.abort( error.stack );
				}
				console.log( "Built zip package at " + path.relative( "../..", targetZip ) );
				return callback();
			});
		}
	]);
}

function buildCDNPackage( callback ) {
	var builder, output, target, targetZip,
		downloadBuilder = require( "download.jqueryui.com" ),
		add = function( file ) {
			output.push( file );
		},
		jqueryUi = new downloadBuilder.JqueryUi( path.resolve( "." ) ),
		themeGallery = downloadBuilder.themeGallery( jqueryUi );

	console.log( "Build CDN Package" );

	builder = new downloadBuilder.Builder( jqueryUi, ":all:" );
	builder.build(function( error, build ) {
		if ( error ) {
			Release.abort( error );
		}
		output = [];
		target = "../" + jqueryUi.pkg.name + "-" + jqueryUi.pkg.version + "-cdn";
		targetZip = target + ".zip";

		[ "AUTHORS.txt", "MIT-LICENSE.txt", "package.json" ].map(function( name ) {
			return build.get( name );
		}).forEach( add );

		// "ui/*.js"
		build.componentFiles.filter(function( file ) {
			return (/^ui\//).test( file.path );
		}).forEach( add );

		// "ui/*.min.js"
		build.componentMinFiles.filter(function( file ) {
			return (/^ui\//).test( file.path );
		}).forEach( add );

		// "i18n/*.js"
		build.i18nFiles.rename( /^ui\//, "" ).forEach( add );
		build.i18nMinFiles.rename( /^ui\//, "" ).forEach( add );
		build.bundleI18n.into( "i18n/" ).forEach( add );
		build.bundleI18nMin.into( "i18n/" ).forEach( add );

		build.bundleJs.forEach( add );
		build.bundleJsMin.forEach( add );

		walk( themeGallery.map(function( theme ) {
			return function( next ) {
				var themeCssOnlyRe, themeDirRe,
					folderName = theme.folderName(),
					packer = new downloadBuilder.Packer( build, theme, {
						skipDocs: true
					});
				// TODO improve code by using custom packer instead of download packer (Packer)
				themeCssOnlyRe = new RegExp( "development-bundle/themes/" + folderName + "/theme.css" );
				themeDirRe = new RegExp( "css/" + folderName );
				packer.pack(function( error, files ) {
					if ( error ) {
						Release.abort( error );
					}
					// Add theme files.
					files
						// Pick only theme files we need on the bundle.
						.filter(function( file ) {
							if ( themeCssOnlyRe.test( file.path ) || themeDirRe.test( file.path ) ) {
								return true;
							}
							return false;
						})
						// Convert paths the way bundle needs
						.map(function( file ) {
							file.path = file.path

								// Remove initial package name eg. "jquery-ui-1.10.0.custom"
								.split( "/" ).slice( 1 ).join( "/" )

								.replace( /development-bundle\/themes/, "css" )
								.replace( /css/, "themes" )

								// Make jquery-ui-1.10.0.custom.css into jquery-ui.css, or jquery-ui-1.10.0.custom.min.css into jquery-ui.min.css
								.replace( /jquery-ui-.*?(\.min)*\.css/, "jquery-ui$1.css" );

							return file;
						}).forEach( add );
					return next();
				});
			};
		}).concat(function() {
			var crypto = require( "crypto" );

			// Create MD5 manifest
			output.push({
				path: "MANIFEST",
				data: output.sort(function( a, b ) {
					return a.path.localeCompare( b.path );
				}).map(function( file ) {
					var md5 = crypto.createHash( "md5" );
					md5.update( file.data );
					return file.path + " " + md5.digest( "hex" );
				}).join( "\n" )
			});

			downloadBuilder.util.createZip( output, targetZip, function( error ) {
				if ( error ) {
					Release.abort( error );
				}
				console.log( "Built zip CDN package at " + path.relative( "../..", targetZip ) );
				return callback();
			});
		}));
	});
}

Release.define({
	issueTracker: "trac",
	contributorReportId: 22,
	changelogShell: function() {
		return "# jQuery UI v" + Release.newVersion + " Changelog\n";
	},
	generateArtifacts: function( fn ) {
		function copyCdnFiles() {
			var zipFile = shell.ls("../jquery*-cdn.zip")[0],
				tmpFolder = "../tmp-zip-output",
				unzipCommand = "unzip -o " + zipFile + " -d " + tmpFolder;

			console.log( "Unzipping for dist/cdn copies" );
			Release.exec({
				command: unzipCommand,
				silent: true
			}, "Failed to unzip cdn files" );

			shell.mkdir( "-p", "dist/cdn" );
			shell.cp( tmpFolder + "/jquery-ui*.js", "dist/cdn" );
			shell.cp( "-r", tmpFolder + "/themes", "dist/cdn" );
			fn( manifestFiles );
		}
		Release.exec( "grunt manifest" );
		var manifestFiles = shell.ls( "*.jquery.json" );
		if ( Release.preRelease ) {
			buildPreReleasePackage( copyCdnFiles );
		} else {
			buildCDNPackage( copyCdnFiles );
		}
	}
});

};

module.exports.dependencies = [
	"jquery/download.jqueryui.com#master",
	"shelljs@0.2.6"
];
