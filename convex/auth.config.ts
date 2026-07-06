// Wire Web3Auth JWTs into Convex auth so ctx.auth.getUserIdentity()
// returns the player's wallet address as the subject.
export default {
  providers: [
    {
      // Web3Auth JWKS endpoint — tokens carry the wallet address as `sub`
      domain: process.env.WEB3AUTH_DOMAIN ?? "https://authjs.web3auth.io",
      applicationID: process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "",
    },
  ],
};
