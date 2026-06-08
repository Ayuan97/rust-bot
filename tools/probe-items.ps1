$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

[void][System.Reflection.Assembly]::LoadFrom('D:/hello/code/rust-bot/tools/lib/mono-cecil-extracted/lib/net40/Mono.Cecil.dll')

$dir = 'D:/hello/code/rust-bot/tools/rust-server/RustDedicated_Data/Managed'
$resolver = New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($dir)
$rp = New-Object Mono.Cecil.ReaderParameters
$rp.AssemblyResolver = $resolver
$module = [Mono.Cecil.ModuleDefinition]::ReadModule("$dir/Assembly-CSharp.dll", $rp)

# 1) ItemDefinition class structure
$itemDef = $module.Types | Where-Object { $_.Name -eq 'ItemDefinition' } | Select-Object -First 1
if ($itemDef) {
    Write-Output ("=== ItemDefinition (" + $itemDef.FullName + ") ===")
    Write-Output ("base: " + $itemDef.BaseType.Name)
    Write-Output ("Public instance fields:")
    foreach ($f in $itemDef.Fields) {
        if (-not $f.IsStatic) {
            Write-Output ("  " + $f.Name + " : " + $f.FieldType.Name)
        }
    }
    Write-Output "Public properties:"
    foreach ($p in $itemDef.Properties) {
        Write-Output ("  " + $p.Name + " : " + $p.PropertyType.Name)
    }
}

Write-Output ""
# 2) ItemManager - the registry
$itemMgr = $module.Types | Where-Object { $_.Name -eq 'ItemManager' } | Select-Object -First 1
if ($itemMgr) {
    Write-Output ("=== ItemManager (" + $itemMgr.FullName + ") ===")
    Write-Output "Static fields:"
    foreach ($f in $itemMgr.Fields) {
        if ($f.IsStatic) {
            Write-Output ("  [static] " + $f.Name + " : " + $f.FieldType.Name)
        }
    }
    Write-Output "Methods:"
    foreach ($m in $itemMgr.Methods) {
        if ($m.Name -match 'Find|Load|Init|item') {
            $params = ($m.Parameters | ForEach-Object { $_.ParameterType.Name } | Out-String).Trim().Replace("`n",", ")
            $static = if ($m.IsStatic) { 'static' } else { 'inst' }
            Write-Output ("  [" + $static + "] " + $m.Name + "(" + $params + ") -> " + $m.ReturnType.Name)
        }
    }
}

Write-Output ""
# 3) Find all Item-related classes
Write-Output "##### Item-related classes #####"
$itemClasses = $module.Types | Where-Object { $_.Name -match '^Item[A-Z]|^Item$|Blueprint' } | Select-Object -First 30
foreach ($t in $itemClasses) { Write-Output ("  " + $t.FullName) }

Write-Output ""
# 4) Where is the item DATA stored?
# In Unity, ItemDefinition is a ScriptableObject; data lives in .asset files
# Check streaming assets / resources
Write-Output "##### Look for item data in StreamingAssets #####"
$streaming = 'D:/hello/code/rust-bot/tools/rust-server/RustDedicated_Data/StreamingAssets'
if (Test-Path $streaming) {
    Get-ChildItem -Path $streaming -Recurse -File | Select-Object -First 20 | ForEach-Object {
        Write-Output ('  ' + $_.FullName.Replace('D:/hello/code/rust-bot/tools/rust-server/', '') + ' (' + [math]::Round($_.Length / 1024) + ' KB)')
    }
}

# Also check Bundles
Write-Output ""
Write-Output "##### Bundles directory #####"
$bundles = 'D:/hello/code/rust-bot/tools/rust-server/Bundles'
if (Test-Path $bundles) {
    Get-ChildItem -Path $bundles -File | Select-Object -First 30 | ForEach-Object {
        Write-Output ('  ' + $_.Name + ' (' + [math]::Round($_.Length / 1024 / 1024, 1) + ' MB)')
    }
}
