const esbuild=require('esbuild');
esbuild.build({entryPoints:['entry.js'],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2020',outfile:'../lib/pkmn.bundle.js',
  define:{'process.env.NODE_ENV':'"production"'},logLevel:'info',
  // @pkmn/sim carga módulos de node de forma opcional
  external:[]}).catch(()=>process.exit(1));
