var shell = require( "shelljs" );
var Release = {
	exec: shell.exec,
	abort: function( msg ) {
		console.error( msg );
		process.exit( 1 );
	},
	define: function( definitions ) {
		for ( var key in definitions ) {
			Release[ key ] = definitions[ key ];
		}
	}
};
var script = require("./release");
shell.exec( "npm install " + script.dependencies.join( " " ) );
script( Release );
Release.generateArtifacts(function() {
	console.log( "Done generating artifacts", arguments );
});
