$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

[void][System.Reflection.Assembly]::LoadFrom('D:/hello/code/rust-bot/tools/lib/mono-cecil-extracted/lib/net40/Mono.Cecil.dll')

$dir = 'D:/hello/code/rust-bot/tools/rust-server/RustDedicated_Data/Managed'
$resolver = New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($dir)
$rp = New-Object Mono.Cecil.ReaderParameters
$rp.AssemblyResolver = $resolver

$mod = [Mono.Cecil.ModuleDefinition]::ReadModule("$dir/Assembly-CSharp.dll", $rp)

# 1) 找所有 [ConVar] / [ServerVar] / [ReplicatedVar] 标记的方法/属性，匹配名字含 "day" / "night" / "time" / "env"
Write-Output '========== ConVars matching day/night/time/env =========='
foreach ($t in $mod.Types) {
    foreach ($member in @($t.Methods) + @($t.Fields) + @($t.Properties)) {
        if (-not $member.HasCustomAttributes) { continue }
        foreach ($attr in $member.CustomAttributes) {
            $an = $attr.AttributeType.Name
            if ($an -notin @('ServerVar','ServerUserVar','ConVar','ReplicatedVar','ClientVar','Help','Command','RustCommand')) { continue }

            $args = @()
            foreach ($a in $attr.ConstructorArguments) { $args += [string]$a.Value }
            foreach ($p in $attr.Properties) { $args += "$($p.Name)=$($p.Argument.Value)" }
            $argStr = $args -join ', '

            $owner = if ($t.Namespace) { "$($t.Namespace).$($t.Name)" } else { $t.Name }
            $mname = $member.Name
            $combined = ("$owner.$mname $argStr").ToLower()
            if ($combined -match '\b(day|night|time|env|sun|tod|cycle|tick)\b') {
                Write-Output "  [$an] $owner.$mname  args=($argStr)"
            }
        }
    }
}

Write-Output ''
Write-Output '========== Fields named "*day*"/"*night*" with constants in initializers =========='
# Find IL stfld targeting fields with day/night in name and check the constant before
foreach ($t in $mod.Types) {
    foreach ($m in $t.Methods) {
        if (-not $m.HasBody) { continue }
        $ins = @($m.Body.Instructions)
        for ($i = 1; $i -lt $ins.Count; $i++) {
            $cur = $ins[$i]
            if ($cur.OpCode.Name -ne 'stfld' -and $cur.OpCode.Name -ne 'stsfld') { continue }
            $opStr = if ($null -ne $cur.Operand) { $cur.Operand.ToString() } else { '' }
            if ($opStr -notmatch 'DayLengthInMinutes|SunriseTime|SunsetTime|TOD_Time|TOD_Sky') { continue }

            # Check previous instruction for constant
            $prev = $ins[$i - 1]
            $prevOp = $prev.OpCode.Name
            $val = ''
            if ($prevOp -match '^ldc\.') {
                if ($null -ne $prev.Operand) { $val = $prev.Operand.ToString() }
                else { $val = $prevOp }  # 短码常量
            }

            Write-Output "  [$($t.Name)::$($m.Name)] $prevOp ($val)  -> stfld $opStr"
        }
    }
}
