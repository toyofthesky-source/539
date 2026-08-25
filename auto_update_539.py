import os
import sys
import csv
import datetime
import requests
import re
import subprocess

def fetch_latest_draws():
    """
    從台灣彩券官方網頁 API 獲取今彩 539 最新開獎數據
    """
    requests.packages.urllib3.disable_warnings()
    now = datetime.datetime.now()
    month_str = now.strftime("%Y-%m")
    url = f"https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result?period&month={month_str}&pageSize=31"
    
    try:
        response = requests.get(url, verify=False, timeout=10)
        if response.status_code != 200:
            print(f"錯誤: 無法連結 API (HTTP {response.status_code})")
            return []
        data = response.json()
        if 'content' not in data or 'daily539Res' not in data['content']:
            print("錯誤: API 回傳格式不符")
            return []
            
        draws = []
        for item in data['content']['daily539Res']:
            period = item['period']
            date_raw = item['lotteryDate'].split('T')[0]
            parts = date_raw.split('-')
            date_str = f"{int(parts[0])}/{int(parts[1])}/{int(parts[2])}"
            nums = item['drawNumberSize']
            
            draws.append({
                "period": period,
                "date": date_str,
                "nums": nums
            })
            
        # 排序由舊到新
        draws.sort(key=lambda x: x["period"])
        return draws
    except Exception as e:
        print(f"錯誤: 爬取資料時發生異常: {e}")
        return []

def load_csv_data(file_path):
    """
    載入 CSV 檔案內容並自動偵測編碼
    """
    encodings = ['big5', 'utf-8-sig', 'utf-8', 'gbk']
    for enc in encodings:
        try:
            with open(file_path, mode='r', encoding=enc) as f:
                content = list(csv.reader(f))
            return content, enc
        except Exception:
            continue
    return None, None

def save_csv_data(file_path, content, encoding):
    """
    將內容寫入 CSV 檔案
    """
    with open(file_path, mode='w', encoding=encoding, newline='') as f:
        writer = csv.writer(f)
        writer.writerows(content)

def check_and_update_database(new_draws):
    """
    比對並更新 CSV 資料庫
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_2026_path = os.path.join(base_dir, "2026", "今彩539_2026.csv")
    if not os.path.exists(csv_2026_path):
        print(f"錯誤: 找不到 CSV 資料庫 {csv_2026_path}")
        return False, []
        
    csv_content, enc = load_csv_data(csv_2026_path)
    if csv_content is None:
        print("錯誤: 無法讀取 CSV 檔案")
        return False, []
        
    # 建立目前資料庫期數集合
    existing_periods = set()
    for row in csv_content[1:]:
        non_empty = [x.strip() for x in row if x.strip()]
        if len(non_empty) >= 8:
            try:
                period = int(non_empty[1])
                existing_periods.add(period)
            except ValueError:
                continue
                
    updates_made = []
    
    for draw in new_draws:
        period = draw["period"]
        if period in existing_periods:
            continue
            
        # 尋找是否已有該日期的 placeholder 列 (列長度符合且第三欄是相同日期)
        date_str = draw["date"]
        row_updated = False
        
        for idx, row in enumerate(csv_content):
            if idx == 0:
                continue
            # 若為空行跳過
            if not row or len(row) < 3:
                continue
            if row[2].strip() == date_str:
                # 替換為完整開獎資料列
                # 原格式範例: 今彩539,期別,開獎日期,銷售總額,獎金總額,中獎注數,開獎號碼1-5
                nums_str = [str(n) for n in draw["nums"]]
                new_row = ["今彩539", str(period), date_str, "", "", ""] + nums_str
                # 補足長度以維持 CSV 結構
                while len(new_row) < len(row):
                    new_row.append("")
                csv_content[idx] = new_row
                row_updated = True
                print(f"更正/寫入已存在的開獎列: {date_str} (期別 {period})")
                break
                
        if not row_updated:
            # 若無此日期的 placeholder 列，直接追加在尾端
            nums_str = [str(n) for n in draw["nums"]]
            new_row = ["今彩539", str(period), date_str, "", "", ""] + nums_str
            # 取第一行的長度作為標準
            header_len = len(csv_content[0]) if csv_content else 11
            while len(new_row) < header_len:
                new_row.append("")
            csv_content.append(new_row)
            print(f"追加新開獎列: {date_str} (期別 {period})")
            
        updates_made.append(draw)
        existing_periods.add(period)
        
    if updates_made:
        save_csv_data(csv_2026_path, csv_content, enc)
        print(f"資料庫更新成功，共更新 {len(updates_made)} 筆期數。")
        return True, updates_made
    else:
        print("沒有發現新的期數，資料庫已是最新狀態。")
        return False, []

def check_previous_predictions(draw):
    """
    尋找前一期的預測報告，並計算本期命中情況
    """
    period = draw["period"]
    date_str = draw["date"] # e.g. "2026/8/20"
    nums = draw["nums"]
    
    # 計算前一天的日期作為可能的檔名前綴
    # 注意：今彩 539 星期日不開獎，若今天是星期一，前一個開獎日是星期六 (2天前)
    try:
        parts = date_str.split('/')
        curr_date = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
    except Exception:
        print("無法解析開獎日期，跳過對獎。")
        return
        
    # 往回推 1 ~ 3 天尋找最近的報告
    prev_report_path = None
    prev_date_str = ""
    for days_back in range(1, 4):
        prev_date = curr_date - datetime.timedelta(days=days_back)
        prefix = f"{prev_date.month}{prev_date.day:02d}"
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(base_dir, f"{prefix}539分析.md")
        if os.path.exists(path):
            prev_report_path = path
            prev_date_str = prev_date.strftime("%Y/%m/%d")
            break
            
    if not prev_report_path:
        print("找不到前一期的預測報告 (可能先前未生成)，跳過對獎。")
        return
        
    print(f"\n--- 開始對獎: 期別 {period} ({date_str}) ---")
    print(f"本期實際獎號: {' '.join(f'{n:02d}' for n in nums)}")
    print(f"找到前一期預測報告: {os.path.basename(prev_report_path)} (對應預測日期: {prev_date_str})")
    
    try:
        with open(prev_report_path, mode='r', encoding='utf-8') as f:
            report_text = f.read()
            
        # 1. 解析綜合推薦 Top 10
        # 尋找第一章節表格中的推薦號碼
        # 範例: | 1 | **04** | 1.00 | ...
        comp_matches = re.findall(r'\|\s*([1-9]|10)\s*\|\s*\*\*(\d+)\*\*\s*\|', report_text)
        comp_nums = [int(x[1]) for x in sorted(comp_matches, key=lambda x: int(x[0]))]
        
        # 2. 解析純拖牌前 5 名 (含並列)
        # 範例: * **第 1 名**：號碼 **25** (歷史拖牌出現 15 次)
        drag_matches = re.findall(r'\*\s*\*\*第\s*(\d+)\s*名\*\*：號碼\s*\*\*(\d+)\*\*', report_text)
        drag_nums = [int(x[1]) for x in drag_matches]
        
        # 計算命中
        comp_hits = [n for n in comp_nums if n in nums]
        drag_hits = [n for n in drag_nums if n in nums]
        
        print(f"> 綜合推薦 Top 10 預測: {', '.join(f'{n:02d}' for n in comp_nums)}")
        print(f"  命中 {len(comp_hits)} 碼: {', '.join(f'{n:02d}' for n in comp_hits) if comp_hits else '無'}")
        
        print(f"> 純拖牌前 5 名 (含並列): {', '.join(f'{n:02d}' for n in drag_nums)}")
        print(f"  命中 {len(drag_hits)} 碼: {', '.join(f'{n:02d}' for n in drag_hits) if drag_hits else '無'}")
        print("------------------------------------------\n")
    except Exception as e:
        print(f"解析前一期報告對獎時發生錯誤: {e}\n")

def run_report_generator():
    """
    調用 539_analyzer.py 編譯今日的最新 analysis 報告
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    analyzer_path = os.path.join(base_dir, "scripts", "539_analyzer.py")
    if not os.path.exists(analyzer_path):
        print(f"警告: 找不到分析腳本 {analyzer_path}")
        return
        
    print("觸發 539_analyzer.py 編譯最新報告中...")
    try:
        result = subprocess.run(
            [sys.executable, analyzer_path],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore'
        )
        if result.returncode == 0:
            print("分析報告生成完畢！")
            # 擷取列印輸出
            for line in result.stdout.split('\n'):
                if "成功生成" in line or "錯誤" in line or "警告" in line:
                    print(f"  > {line.strip()}")
        else:
            print(f"編譯失敗: {result.stderr}")
    except Exception as e:
        print(f"執行分析報告腳本時發生異常: {e}")

def main():
    print(f"=== 今彩539每日自動更新程序啟動 (時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) ===")
    
    # 1. 爬取最新網頁數據
    print("正在從台灣彩券官方網頁抓取資料...")
    new_draws = fetch_latest_draws()
    if not new_draws:
        print("未獲取到任何開獎數據，程式退出。")
        return
        
    print(f"順利獲取本月份共 {len(new_draws)} 期開獎紀錄。")
    
    # 2. 比對並更新資料庫
    has_updates, updated_draws = check_and_update_database(new_draws)
    
    # 3. 如果有更新，對最新一期進行對獎，並重新生成報告
    if has_updates:
        # 對最新的一期進行對獎 (通常為最後一筆)
        check_previous_predictions(updated_draws[-1])
        
        # 執行生成新的報告
        run_report_generator()
    else:
        print("無新資料需要處理。")
        
    print("=== 更新程序執行結束 ===\n")

if __name__ == "__main__":
    main()
