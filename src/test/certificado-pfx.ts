import forge from 'node-forge'

export function createTestPfx(cnpj: string, password = 'senha-a1'): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const certificate = forge.pki.createCertificate()
  certificate.publicKey = keys.publicKey
  certificate.serialNumber = '01'
  certificate.validity.notBefore = new Date('2026-01-01')
  certificate.validity.notAfter = new Date('2036-01-01')
  const subject = [{ name: 'commonName', value: `EMPRESA TESTE:${cnpj}` }]
  certificate.setSubject(subject)
  certificate.setIssuer(subject)
  certificate.sign(keys.privateKey)
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, password, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary')
}
