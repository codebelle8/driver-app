# HTML を Word に開かせて、.doc として保存し直す。
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/make-doc.ps1 `
#       -Html "C:\driver\docs\out\車寄せナビ_規約類（たたき台）.html"
#
# **変換を自前で書かない。**
#   書式の取りこぼしを自分で埋めるより、Word 本体に開かせて保存させた
#   ほうが確かにあたる。先方が開くのと同じ経路を通る。
#
# **画面を出さない。** Visible = $false で動かし、終わったら必ず閉じる。
#   閉じ忘れると WINWORD.EXE が residual で残り、次回以降の変換が
#   固まることがある。finally で落とす。

param(
  [Parameter(Mandatory = $true)][string]$Html,
  # 0 = .doc（Word 97-2003）／12 = .docx
  [int]$Format = 0,
  # 見た目の確かめ用に PDF も出すか
  [switch]$Pdf
)

$ErrorActionPreference = 'Stop'

$src = (Resolve-Path $Html).Path
$ext = if ($Format -eq 0) { '.doc' } else { '.docx' }
$out = [System.IO.Path]::ChangeExtension($src, $ext)

$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $doc = $word.Documents.Open($src, $false, $true)

  # 余白。既定のままだと表が右へはみ出す。
  $doc.PageSetup.TopMargin = $word.CentimetersToPoints(2.0)
  $doc.PageSetup.BottomMargin = $word.CentimetersToPoints(2.0)
  $doc.PageSetup.LeftMargin = $word.CentimetersToPoints(2.0)
  $doc.PageSetup.RightMargin = $word.CentimetersToPoints(2.0)

  # 下端に頁番号。規約は印刷して回覧されるため、番号が無いと順が崩れる。
  $footer = $doc.Sections.Item(1).Footers.Item(1)
  $footer.PageNumbers.Add(2, $true) | Out-Null   # 2 = 中央

  if (Test-Path $out) { Remove-Item $out -Force }
  $doc.SaveAs([ref]$out, [ref]$Format)
  Write-Output $out

  # 見た目の確かめ用に PDF も出す。
  #
  # **この環境では、Word に頁数を聞いても当てにならない。** 画面の
  # ない場所で動かしているため、組版の値が狂う（112頁と答えたものが、
  # 実際には12頁だった）。PDF に出せば、実際の組み上がりが分かる。
  if ($Pdf) {
    $pdfPath = [System.IO.Path]::ChangeExtension($src, '.pdf')
    if (Test-Path $pdfPath) { Remove-Item $pdfPath -Force }
    $doc.ExportAsFixedFormat($pdfPath, 17)
    Write-Output $pdfPath
  }

  $doc.Close([ref]$false)
  $doc = $null
}
finally {
  if ($doc) { try { $doc.Close([ref]$false) } catch {} }
  if ($word) {
    try { $word.Quit() } catch {}
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  }
}
