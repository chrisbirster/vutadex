/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "vutadex",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // SES identity, DKIM and the custom MAIL FROM domain are infrastructure;
    // the Go binary itself remains on Fly.io.
    const email = new sst.aws.Email("AuthEmail", {
      sender: "vutadex.com",
      mailFrom: { domain: "mail.vutadex.com" },
      dns: sst.cloudflare.dns(),
    });

    return {
      sesSender: email.sender,
    };
  },
});
