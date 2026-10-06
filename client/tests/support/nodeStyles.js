// Browser styles are irrelevant to Node markup checks; keep the real graph components.
export const nodeStyles = {
  name:'styles-in-node',
  setup(build) {
    build.onResolve({filter:/\.css$/}, args=>({path:args.path,namespace:'styles'}));
    build.onLoad({filter:/.*/,namespace:'styles'}, ()=>({contents:'',loader:'js'}));
  },
};
