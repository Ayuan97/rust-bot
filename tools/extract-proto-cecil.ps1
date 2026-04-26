# Extract protobuf schema from Rust dedicated server DLLs using Mono.Cecil.
# Output: tools/extracted.proto + tools/extracted.json
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$cecilPath = 'D:/hello/code/rust-bot/tools/lib/mono-cecil-extracted/lib/net40/Mono.Cecil.dll'
[void][System.Reflection.Assembly]::LoadFrom($cecilPath)

$dir = 'D:/hello/code/rust-bot/tools/rust-server/RustDedicated_Data/Managed'
$dllPath = "$dir/Rust.Data.dll"
$outProto = 'D:/hello/code/rust-bot/tools/extracted.proto'
$outJson = 'D:/hello/code/rust-bot/tools/extracted.json'

Write-Output "[1/4] Loading Rust.Data.dll with Mono.Cecil"
# Use a resolver that searches the Managed folder for dependent assemblies
$resolver = New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($dir)
$readerParams = New-Object Mono.Cecil.ReaderParameters
$readerParams.AssemblyResolver = $resolver
$module = [Mono.Cecil.ModuleDefinition]::ReadModule($dllPath, $readerParams)
Write-Output ("    module: " + $module.Name)

Write-Output "[2/4] Filtering ProtoBuf namespace types"
$protoTypes = @($module.Types | Where-Object { $_.Namespace -eq 'ProtoBuf' })
Write-Output ("    type count: " + $protoTypes.Count)

function Get-ProtoTypeName {
    param($typeRef)
    $n = $typeRef.Name
    if ($n -eq 'Boolean') { return 'bool' }
    if ($n -eq 'Int32')   { return 'int32' }
    if ($n -eq 'UInt32')  { return 'uint32' }
    if ($n -eq 'Int64')   { return 'int64' }
    if ($n -eq 'UInt64')  { return 'uint64' }
    if ($n -eq 'Single')  { return 'float' }
    if ($n -eq 'Double')  { return 'double' }
    if ($n -eq 'String')  { return 'string' }
    if ($n -eq 'Byte[]' -or $typeRef.IsArray) {
        if ($typeRef.IsArray -and $typeRef.GetElementType().Name -eq 'Byte') { return 'bytes' }
    }
    if ($typeRef.IsGenericInstance) {
        $genName = $typeRef.GetElementType().Name
        if ($genName -like 'List*') {
            $inner = Get-ProtoTypeName -typeRef $typeRef.GenericArguments[0]
            return ('repeated ' + $inner)
        }
    }
    return $n
}

function Get-WireTypeName {
    param($wt)
    if ($wt -eq 0) { return 'varint' }
    if ($wt -eq 1) { return 'fixed64' }
    if ($wt -eq 2) { return 'len' }
    if ($wt -eq 5) { return 'fixed32' }
    return ('wt' + $wt)
}

function Get-Ldci4 {
    param($instr)
    if (-not $instr) { return $null }
    $name = $instr.OpCode.Name
    if ($name -eq 'ldc.i4.m1') { return -1 }
    if ($name -match '^ldc\.i4\.([0-9])$') { return [int]$Matches[1] }
    if ($name -in @('ldc.i4.s','ldc.i4')) { return [int]$instr.Operand }
    return $null
}

# Heuristic: target of callvirt/call after a tag byte should look like a single-byte writer
# (BufferStream::WriteByte, or 'WriteByte'-named members). Reject obvious non-writer calls.
function Is-WriteByteCall {
    param($instr)
    if (-not $instr) { return $false }
    if ($instr.OpCode.Name -notin @('callvirt','call')) { return $false }
    $op = $instr.Operand
    if (-not $op) { return $false }
    return ($op.Name -eq 'WriteByte')
}

function Extract-FieldsFromMethod {
    param($method, $messageType)
    if (-not $method.HasBody) { return @() }
    $instrs = @($method.Body.Instructions)
    $results = New-Object System.Collections.ArrayList
    for ($k = 0; $k -lt $instrs.Count; $k++) {
        $val = Get-Ldci4 -instr $instrs[$k]
        if ($null -eq $val) { continue }
        if ($val -lt 8 -or $val -gt 255) { continue }
        if ($k + 1 -ge $instrs.Count) { continue }
        if (-not (Is-WriteByteCall -instr $instrs[$k + 1])) { continue }

        # We have a tag byte X; if MSB set, gather varint continuation bytes
        $tagValue = $val -band 0x7F
        $shift = 7
        $consumed = 1
        $lastTagWriteIdx = $k + 1
        if (($val -band 0x80) -ne 0) {
            # multi-byte varint: scan forward for the next [ldc.i4 Y; WriteByte] pair.
            # SilentOrbit emits ldarg.0 (or similar) between byte writes, so allow gaps.
            $scan = $k + 2
            $maxBytes = 5
            while ($consumed -lt $maxBytes) {
                $found = $false
                $upper = [Math]::Min($scan + 4, $instrs.Count - 1)
                for ($s = $scan; $s -lt $upper; $s++) {
                    $cand = Get-Ldci4 -instr $instrs[$s]
                    if ($null -eq $cand) { continue }
                    if (-not (Is-WriteByteCall -instr $instrs[$s + 1])) { continue }
                    $tagValue = $tagValue -bor (($cand -band 0x7F) -shl $shift)
                    $shift += 7
                    $consumed++
                    $lastTagWriteIdx = $s + 1
                    $scan = $s + 2
                    $found = $true
                    if (($cand -band 0x80) -eq 0) { $scan = $instrs.Count }
                    break
                }
                if (-not $found) { break }
                if ($scan -ge $instrs.Count) { break }
            }
            if ($consumed -eq 1) { continue }
        }

        $fieldNum = $tagValue -shr 3
        $wireType = $tagValue -band 7
        if ($fieldNum -lt 1) { continue }
        if ($wireType -notin @(0,1,2,5)) { continue }

        # Find nearest ldfld in the next 30 instructions whose declaring type is the message
        $fieldName = $null
        $fieldType = $null
        $startJ = $lastTagWriteIdx + 1
        $maxJ = [Math]::Min($startJ + 30, $instrs.Count)
        for ($j = $startJ; $j -lt $maxJ; $j++) {
            $jOp = $instrs[$j].OpCode.Name
            if ($jOp -eq 'ldfld' -or $jOp -eq 'ldflda') {
                $fldRef = $instrs[$j].Operand
                if ($fldRef -and $fldRef.DeclaringType.FullName -eq $messageType.FullName) {
                    $fieldName = $fldRef.Name
                    $fieldType = $fldRef.FieldType
                    break
                }
            }
        }
        if (-not $fieldName) { continue }

        $netT = $fieldType.Name
        $protoT = Get-ProtoTypeName -typeRef $fieldType

        [void]$results.Add([PSCustomObject]@{
            Field = $fieldName
            Tag = $fieldNum
            WireType = $wireType
            NetType = $netT
            ProtoType = $protoT
        })
    }
    return $results
}

Write-Output "[3/4] Extracting fields per message"
$allMessages = New-Object System.Collections.ArrayList
$allEnums = New-Object System.Collections.ArrayList

foreach ($t in $protoTypes) {
    if ($t.IsEnum) {
        $values = New-Object System.Collections.ArrayList
        foreach ($f in $t.Fields) {
            if ($f.IsStatic -and $f.HasConstant) {
                [void]$values.Add(@{ Name = $f.Name; Value = [int]$f.Constant })
            }
        }
        [void]$allEnums.Add(@{ Name = $t.Name; Values = $values })
        continue
    }
    if (-not $t.IsClass) { continue }
    if ($t.IsAbstract) { continue }
    $serialize = $null
    foreach ($m in $t.Methods) {
        if ($m.Name -eq 'Serialize' -and $m.IsStatic -and $m.Parameters.Count -eq 2) { $serialize = $m; break }
    }
    if (-not $serialize) { continue }
    $fields = Extract-FieldsFromMethod -method $serialize -messageType $t
    $seen = @{}
    $unique = New-Object System.Collections.ArrayList
    foreach ($r in $fields) {
        if (-not $seen.ContainsKey($r.Field)) {
            $seen[$r.Field] = $true
            [void]$unique.Add($r)
        }
    }
    [void]$allMessages.Add(@{ Name = $t.Name; Fields = $unique })
}
Write-Output ("    messages: " + $allMessages.Count + ", enums: " + $allEnums.Count)
$nonEmpty = ($allMessages | Where-Object { $_.Fields.Count -gt 0 }).Count
Write-Output ("    non-empty: " + $nonEmpty + " / " + $allMessages.Count)

Write-Output "[4/4] Writing outputs"
$lines = New-Object System.Collections.ArrayList
[void]$lines.Add('syntax = "proto2";')
[void]$lines.Add('package rustplus;')
[void]$lines.Add('')
foreach ($e in ($allEnums | Sort-Object { $_.Name })) {
    [void]$lines.Add(('enum ' + $e.Name + ' {'))
    foreach ($v in $e.Values) {
        [void]$lines.Add(('    ' + $v.Name + ' = ' + $v.Value + ';'))
    }
    [void]$lines.Add('}')
    [void]$lines.Add('')
}
foreach ($m in ($allMessages | Sort-Object { $_.Name })) {
    [void]$lines.Add(('message ' + $m.Name + ' {'))
    $sortedFields = $m.Fields | Sort-Object Tag
    foreach ($f in $sortedFields) {
        $modifier = 'optional'
        $proto = $f.ProtoType
        if ($proto -like 'repeated *') { $modifier = ''; }
        $line = ('    ' + $modifier + ' ' + $proto + ' ' + $f.Field + ' = ' + $f.Tag + '; // wt=' + (Get-WireTypeName -wt $f.WireType) + ' net=' + $f.NetType)
        [void]$lines.Add($line)
    }
    [void]$lines.Add('}')
    [void]$lines.Add('')
}
$lines -join "`n" | Out-File -FilePath $outProto -Encoding utf8
Write-Output ("    wrote: " + $outProto)

$dump = @{ enums = @($allEnums); messages = @($allMessages) }
$dump | ConvertTo-Json -Depth 8 | Out-File -FilePath $outJson -Encoding utf8
Write-Output ("    wrote: " + $outJson)

Write-Output ""
Write-Output "=== Sample checks ==="
foreach ($name in @('AppFlag','AppMarker','AppCameraInfo','AppMessage','AppRequest','AppMap','AppEntityInfo')) {
    $m = $allMessages | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if ($m) {
        $sample = ($m.Fields | Sort-Object Tag | ForEach-Object { ($_.Field + '=' + $_.Tag) }) -join ', '
        Write-Output ("  " + $name + " (" + $m.Fields.Count + "): " + $sample)
    }
}
