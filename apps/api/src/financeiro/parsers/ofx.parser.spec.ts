import { detectarContaOfx } from './ofx.parser';

const OFX_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>077
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260701120000[-3:BRT]
<TRNAMT>-100.00
<FITID>202607010001
<MEMO>Pix enviado
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe('detectarContaOfx', () => {
  it('extrai o ACCTID do bloco BANKACCTFROM', () => {
    expect(detectarContaOfx(Buffer.from(OFX_SAMPLE, 'utf8'))).toBe('12345-6');
  });

  it('retorna null quando o arquivo não tem bloco BANKACCTFROM', () => {
    const semConta = '<OFX><BANKMSGSRSV1></BANKMSGSRSV1></OFX>';
    expect(detectarContaOfx(Buffer.from(semConta, 'utf8'))).toBeNull();
  });
});
