param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$PayloadPath
)

$ErrorActionPreference = 'Stop'

function Get-OleColor([int]$R, [int]$G, [int]$B) {
  return ($R -bor ($G -shl 8) -bor ($B -shl 16))
}

function Get-SlideText($Slide) {
  $chunks = New-Object System.Collections.Generic.List[string]
  foreach ($shape in $Slide.Shapes) {
    if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
      $text = $shape.TextFrame.TextRange.Text
      if ($text) {
        $clean = ($text -replace '\s+', ' ').Trim()
        if ($clean) {
          $chunks.Add($clean)
        }
      }
    }
  }
  return ($chunks -join ' | ')
}

function Set-PlaceholderText($Slide, [int]$PlaceholderType, [string]$Text, [int]$FontSize = 20) {
  foreach ($shape in $Slide.Shapes) {
    if ($shape.Type -eq 14 -and $shape.PlaceholderFormat.Type -eq $PlaceholderType) {
      $shape.TextFrame.TextRange.Text = $Text
      $shape.TextFrame.TextRange.Font.Size = $FontSize
      $shape.TextFrame.TextRange.Font.Name = 'Aptos'
      return $shape
    }
  }
  return $null
}

function Set-BulletLines($Shape, $Lines, [int]$FontSize = 20, [int]$BulletIndent = 20) {
  $Shape.TextFrame.TextRange.Text = ''
  $textRange = $Shape.TextFrame.TextRange
  if (-not $Lines -or $Lines.Count -eq 0) {
    $textRange.Text = 'Sem informacao disponivel.'
    $textRange.Font.Size = $FontSize
    return
  }

  $textRange.Text = ($Lines -join "`r")
  $paragraphCount = $textRange.Paragraphs().Count
  for ($i = 1; $i -le $paragraphCount; $i++) {
    $paragraph = $textRange.Paragraphs($i, 1)
    $paragraph.Font.Name = 'Aptos'
    $paragraph.Font.Size = $FontSize
    $paragraph.ParagraphFormat.Bullet.Visible = -1
    $paragraph.ParagraphFormat.Bullet.Character = 8226
    $paragraph.ParagraphFormat.SpaceAfter = 6
    $paragraph.ParagraphFormat.SpaceWithin = 1.05
  }
}

function Add-Textbox($Slide, [float]$Left, [float]$Top, [float]$Width, [float]$Height, [string]$Text, [int]$FontSize = 18, [bool]$Bold = $false, [bool]$Accent = $false) {
  $shape = $Slide.Shapes.AddTextbox(1, $Left, $Top, $Width, $Height)
  $shape.TextFrame.TextRange.Text = $Text
  $shape.TextFrame.TextRange.Font.Name = 'Aptos'
  $shape.TextFrame.TextRange.Font.Size = $FontSize
  $shape.TextFrame.TextRange.Font.Bold = $(if ($Bold) { -1 } else { 0 })
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 6
  $shape.TextFrame.TextRange.ParagraphFormat.SpaceWithin = 1.05
  if ($Accent) {
    $shape.TextFrame.TextRange.Font.Color.RGB = Get-OleColor 227 25 55
  } else {
    $shape.TextFrame.TextRange.Font.Color.RGB = Get-OleColor 17 17 17
  }
  return $shape
}

function Add-MetricCard($Slide, [float]$Left, [float]$Top, [float]$Width, [float]$Height, $Metric) {
  $shape = $Slide.Shapes.AddShape(5, $Left, $Top, $Width, $Height)
  $shape.Fill.ForeColor.RGB = Get-OleColor 255 255 255
  $shape.Fill.Transparency = 0
  $shape.Line.ForeColor.RGB = Get-OleColor 227 25 55
  $shape.Line.Transparency = 0.15
  $shape.Line.Weight = 1.2
  $shape.Shadow.Visible = -1
  $shape.Shadow.Blur = 8
  $shape.Shadow.ForeColor.RGB = Get-OleColor 0 0 0
  $shape.Shadow.Transparency = 0.85

  $text = $shape.TextFrame.TextRange
  $text.Text = "$($Metric.label)`r$($Metric.value)`r$($Metric.detail)"
  $text.Font.Name = 'Aptos'

  $paragraphCount = $text.Paragraphs().Count
  if ($paragraphCount -ge 1) {
    $text.Paragraphs(1, 1).Font.Size = 12
    $text.Paragraphs(1, 1).Font.Bold = -1
    $text.Paragraphs(1, 1).Font.Color.RGB = Get-OleColor 107 114 128
    $text.Paragraphs(1, 1).ParagraphFormat.SpaceAfter = 4
  }
  if ($paragraphCount -ge 2) {
    $text.Paragraphs(2, 1).Font.Size = 24
    $text.Paragraphs(2, 1).Font.Bold = -1
    $text.Paragraphs(2, 1).Font.Color.RGB = Get-OleColor 17 17 17
    $text.Paragraphs(2, 1).ParagraphFormat.SpaceAfter = 3
  }
  if ($paragraphCount -ge 3) {
    $text.Paragraphs(3, 1).Font.Size = 11
    $text.Paragraphs(3, 1).Font.Color.RGB = Get-OleColor 85 85 85
  }
}

function Add-SectionTag($Slide, [string]$Text) {
  $shape = $Slide.Shapes.AddShape(5, 34, 30, 180, 26)
  $shape.Fill.ForeColor.RGB = Get-OleColor 227 25 55
  $shape.Line.Visible = 0
  $shape.TextFrame.TextRange.Text = $Text
  $shape.TextFrame.TextRange.Font.Name = 'Aptos'
  $shape.TextFrame.TextRange.Font.Size = 11
  $shape.TextFrame.TextRange.Font.Bold = -1
  $shape.TextFrame.TextRange.Font.Color.RGB = Get-OleColor 255 255 255
}

function Get-LayoutByName($Presentation, [string]$Name, [int]$FallbackIndex) {
  foreach ($layout in $Presentation.SlideMaster.CustomLayouts) {
    if ($layout.Name -eq $Name) {
      return $layout
    }
  }
  return $Presentation.SlideMaster.CustomLayouts.Item($FallbackIndex)
}

function Add-BulletsSlide($Presentation, [int]$Index, [string]$Title, $Lines, [string]$LayoutName = 'Título e Objeto', [int]$FallbackIndex = 2, [string]$Tag = '') {
  $layout = Get-LayoutByName $Presentation $LayoutName $FallbackIndex
  $slide = $Presentation.Slides.AddSlide($Index, $layout)
  if ($Tag) { Add-SectionTag $slide $Tag | Out-Null }
  $titleShape = Set-PlaceholderText $slide 1 $Title 28
  if ($titleShape) {
    $titleShape.TextFrame.TextRange.Font.Color.RGB = Get-OleColor 17 17 17
    $titleShape.TextFrame.TextRange.Font.Bold = -1
  }
  foreach ($shape in $slide.Shapes) {
    if ($shape.Type -eq 14 -and $shape.PlaceholderFormat.Type -eq 2) {
      Set-BulletLines $shape $Lines 18 22
      break
    }
  }
  return $slide
}

function Add-DualBulletsSlide($Presentation, [int]$Index, [string]$Title, $LeftLines, $RightLines, [string]$LeftHeader, [string]$RightHeader, [string]$Tag = '') {
  $layout = Get-LayoutByName $Presentation 'Conteúdo Duplo' 4
  $slide = $Presentation.Slides.AddSlide($Index, $layout)
  if ($Tag) { Add-SectionTag $slide $Tag | Out-Null }
  $titleShape = Set-PlaceholderText $slide 1 $Title 28
  if ($titleShape) {
    $titleShape.TextFrame.TextRange.Font.Color.RGB = Get-OleColor 17 17 17
    $titleShape.TextFrame.TextRange.Font.Bold = -1
  }

  $contentShapes = @()
  foreach ($shape in $slide.Shapes) {
    if ($shape.Type -eq 14 -and $shape.PlaceholderFormat.Type -eq 7) {
      $contentShapes += $shape
    }
  }

  if ($contentShapes.Count -ge 1) {
    Set-BulletLines $contentShapes[0] (@($LeftHeader) + @('') + $LeftLines) 16 20
    $contentShapes[0].TextFrame.TextRange.Paragraphs(1, 1).Font.Bold = -1
    $contentShapes[0].TextFrame.TextRange.Paragraphs(1, 1).Font.Color.RGB = Get-OleColor 227 25 55
    $contentShapes[0].TextFrame.TextRange.Paragraphs(2, 1).ParagraphFormat.Bullet.Visible = 0
  }
  if ($contentShapes.Count -ge 2) {
    Set-BulletLines $contentShapes[1] (@($RightHeader) + @('') + $RightLines) 16 20
    $contentShapes[1].TextFrame.TextRange.Paragraphs(1, 1).Font.Bold = -1
    $contentShapes[1].TextFrame.TextRange.Paragraphs(1, 1).Font.Color.RGB = Get-OleColor 227 25 55
    $contentShapes[1].TextFrame.TextRange.Paragraphs(2, 1).ParagraphFormat.Bullet.Visible = 0
  }
  return $slide
}

function Add-ExecutiveSummarySlide($Presentation, [int]$Index, $Payload) {
  $layout = Get-LayoutByName $Presentation 'Em branco' 7
  $slide = $Presentation.Slides.AddSlide($Index, $layout)
  Add-SectionTag $slide 'Resumo executivo' | Out-Null
  Add-Textbox $slide 34 68 980 40 'Resumo executivo do steering' 28 $true $false | Out-Null
  Add-Textbox $slide 34 116 1080 70 $Payload.summary_paragraph 18 $false $false | Out-Null

  $cards = @($Payload.metric_cards)
  $cardWidth = 250
  $gap = 18
  $top = 208
  for ($i = 0; $i -lt [Math]::Min($cards.Count, 4); $i++) {
    $left = 34 + (($cardWidth + $gap) * $i)
    Add-MetricCard $slide $left $top $cardWidth 100 $cards[$i]
  }

  Add-Textbox $slide 34 336 520 28 'Mensagem executiva' 16 $true $true | Out-Null
  Add-Textbox $slide 34 366 520 136 $Payload.executive_tagline 17 $false $false | Out-Null

  Add-Textbox $slide 586 336 526 28 'Mensagens para steering' 16 $true $true | Out-Null
  $messageBox = $slide.Shapes.AddTextbox(1, 586, 366, 526, 170)
  Set-BulletLines $messageBox @($Payload.steering_messages) 16 22

  if ($Payload.footer_note) {
    Add-Textbox $slide 34 650 1060 22 $Payload.footer_note 10 $false $false | Out-Null
  }
}

$payload = Get-Content -LiteralPath $PayloadPath -Raw | ConvertFrom-Json
$powerPoint = $null
$presentation = $null

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.DisplayAlerts = 1
  $presentation = $powerPoint.Presentations.Open($TemplatePath, $false, $false, $false)

  $coverIndex = 1
  $closingIndex = $null
  for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
    $text = Get-SlideText $presentation.Slides.Item($i)
    if ($text -match 'Thank you|OBRIGADO|Obrigado') {
      $closingIndex = $i
      break
    }
  }
  if (-not $closingIndex) {
    $closingIndex = $presentation.Slides.Count
  }

  for ($i = $presentation.Slides.Count; $i -ge 1; $i--) {
    if ($i -ne $coverIndex -and $i -ne $closingIndex) {
      $presentation.Slides.Item($i).Delete()
    }
  }

  $coverSlide = $presentation.Slides.Item(1)
  Add-Textbox $coverSlide 94 420 820 34 ($payload.deck_subtitle) 22 $true $false | Out-Null
  Add-Textbox $coverSlide 94 458 820 58 ($payload.executive_tagline) 18 $false $false | Out-Null

  $insertAt = 2
  $sectionLayout = Get-LayoutByName $presentation 'Cabeçalho da Secção' 3
  $sectionSlide = $presentation.Slides.AddSlide($insertAt, $sectionLayout)
  Set-PlaceholderText $sectionSlide 1 'Status Executivo' 30 | Out-Null
  Set-PlaceholderText $sectionSlide 2 'Leitura automatica do plano, focada em progresso, risco e proxima vaga.' 18 | Out-Null

  Add-BulletsSlide $presentation 3 'Objetivo do steering' @($payload.objective_bullets) 'Título e Objeto' 2 'Foco steering' | Out-Null
  Add-ExecutiveSummarySlide $presentation 4 $payload
  Add-BulletsSlide $presentation 5 'Saude das releases de desenvolvimento' @($payload.release_bullets) 'Título e Objeto' 2 'Releases' | Out-Null
  Add-DualBulletsSlide $presentation 6 'Execucao atual e proxima vaga' @($payload.current_actions) @($payload.upcoming_actions) 'O que esta a acontecer agora' 'O que vai acontecer a seguir' 'Execucao' | Out-Null
  Add-DualBulletsSlide $presentation 7 'Risco e checkpoints de steering' @($payload.risk_items) @($payload.checkpoints) 'O que esta em risco' 'Checkpoints a acompanhar' 'Risco' | Out-Null
  Add-BulletsSlide $presentation 8 'Mensagens para decisao / acompanhamento' @($payload.steering_messages) 'Título e Objeto' 2 'Seguimento' | Out-Null

  $presentation.SaveAs($OutputPath)
  Write-Output $OutputPath
}
finally {
  if ($presentation) {
    $presentation.Close()
  }
  if ($powerPoint) {
    $powerPoint.Quit()
  }
}
