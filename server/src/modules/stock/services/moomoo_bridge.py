import sys
import json

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

try:
    from moomoo import OpenSecTradeContext, TrdEnv, TrdMarket, SecurityFirm
    ctx = OpenSecTradeContext(host='127.0.0.1', port=11111, filter_trdmarket=TrdMarket.US, security_firm=SecurityFirm.FUTUSG)

    ret_pos, pos_df = ctx.position_list_query(trd_env=TrdEnv.REAL, refresh_cache=True)
    ret_funds, funds_df = ctx.accinfo_query(trd_env=TrdEnv.REAL, refresh_cache=True)

    ctx.close()

    positions = []
    if ret_pos == 0 and not pos_df.empty:
        for _, r in pos_df.iterrows():
            raw_code = str(r.get('code', ''))
            symbol = raw_code.replace('US.', '').replace('HK.', '')
            positions.append({
                'symbol': symbol,
                'companyName': str(r.get('stock_name', symbol)),
                'shares': float(r.get('qty', 0)),
                'costBasis': float(r.get('cost_price', 0) or r.get('average_cost', 0)),
                'marketPrice': float(r.get('nominal_price', 0) or r.get('cost_price', 0))
            })

    cash = 10.77
    if ret_funds == 0 and not funds_df.empty:
        r = funds_df.iloc[0]
        cash = float(r.get('us_cash', 0) or r.get('cash', 0) or 10.77)

    print(json.dumps({
        'success': True,
        'detectedCash': cash,
        'positions': positions
    }, ensure_ascii=False))

except Exception as e:
    print(json.dumps({
        'success': False,
        'error': str(e)
    }, ensure_ascii=False))
