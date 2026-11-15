declare module "paytmchecksum" {
  const PaytmChecksum: {
    generateSignature(body: string | Record<string, string>, key: string): Promise<string>;
    verifySignature(body: string | Record<string, string>, key: string, signature: string): boolean;
  };
  export default PaytmChecksum;
}
