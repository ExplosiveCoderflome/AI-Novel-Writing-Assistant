import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  CardFooter
} from '../ui/card';
import { Button } from '../ui/button';
import { WorldPropertyLibraryItem } from '@/types/worldV2';
import { Loader2, PlusCircle, Heart, BookmarkPlus } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface PropertyLibraryProps {
  worldType?: string;
  onSelectProperty?: (property: WorldPropertyLibraryItem) => void;
  showAddButton?: boolean;
}

export default function PropertyLibrary({ 
  worldType, 
  onSelectProperty,
  showAddButton = true
}: PropertyLibraryProps) {
  const [properties, setProperties] = useState<WorldPropertyLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<string>('all');
  
  // 加载属性库
  const loadProperties = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = new URL('/api/worlds/v2/property-library', window.location.origin);
      if (worldType) {
        url.searchParams.append('worldType', worldType);
      }
      
      const response = await fetch(url.toString());
      const data = await response.json();
      
      if (data.success && data.data) {
        setProperties(data.data);
      } else {
        setError(data.error || '加载属性库失败');
      }
    } catch (error) {
      console.error('加载属性库错误:', error);
      setError('加载属性库时发生错误');
    } finally {
      setLoading(false);
    }
  };
  
  // 增加属性使用次数
  const incrementUsage = async (id: string) => {
    try {
      await fetch('/api/worlds/v2/property-library', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
    } catch (error) {
      console.error('增加使用次数失败:', error);
    }
  };
  
  // 处理属性选择
  const handleSelectProperty = (property: WorldPropertyLibraryItem) => {
    if (onSelectProperty) {
      incrementUsage(property.id);
      onSelectProperty(property);
    }
  };
  
  // 初始加载
  useEffect(() => {
    loadProperties();
  }, [worldType]);
  
  // 过滤属性
  const filteredProperties = properties.filter(property => {
    // 搜索词过滤
    const matchesSearch = 
      property.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      property.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 世界类型过滤
    const matchesFilter = 
      filter === 'all' || 
      property.worldType === filter;
    
    return matchesSearch && matchesFilter;
  });
  
  // 获取所有世界类型
  const worldTypes = Array.from(new Set(properties.map(p => p.worldType)));
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
        <div className="flex-1">
          <Label htmlFor="search-property">搜索属性</Label>
          <Input 
            id="search-property"
            placeholder="输入关键词搜索..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="w-full md:w-48">
          <Label htmlFor="filter-world-type">世界类型</Label>
          <Select 
            value={filter} 
            onValueChange={setFilter}
          >
            <SelectTrigger id="filter-world-type">
              <SelectValue placeholder="所有类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有类型</SelectItem>
              {worldTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-end">
          <Button onClick={loadProperties} variant="outline" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载中
              </>
            ) : (
              '刷新'
            )}
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md">
          错误: {error}
        </div>
      )}
      
      <Tabs defaultValue="grid">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="grid">网格视图</TabsTrigger>
            <TabsTrigger value="list">列表视图</TabsTrigger>
          </TabsList>
          
          <div>
            <Badge variant="outline">
              共 {filteredProperties.length} 个属性
            </Badge>
          </div>
        </div>
        
        <TabsContent value="grid" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3">加载属性库...</span>
            </div>
          ) : filteredProperties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProperties.map((property) => (
                <Card key={property.id} className="h-full flex flex-col">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{property.name}</CardTitle>
                      <Badge variant="outline">{property.worldType.replace(/_/g, ' ')}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">{property.description}</p>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Heart className="h-4 w-4 mr-1" />
                      <span>已使用 {property.usageCount} 次</span>
                    </div>
                    {showAddButton && (
                      <Button size="sm" onClick={() => handleSelectProperty(property)}>
                        <PlusCircle className="h-4 w-4 mr-1" />
                        添加
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm || filter !== 'all' ? '没有找到匹配的属性' : '属性库为空'}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="list" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3">加载属性库...</span>
            </div>
          ) : filteredProperties.length > 0 ? (
            <div className="space-y-2">
              {filteredProperties.map((property) => (
                <div 
                  key={property.id} 
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="flex-grow">
                    <div className="flex items-center">
                      <h4 className="font-medium">{property.name}</h4>
                      <Badge className="ml-2" variant="outline">
                        {property.worldType.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{property.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">
                      已用 {property.usageCount} 次
                    </Badge>
                    {showAddButton && (
                      <Button size="sm" onClick={() => handleSelectProperty(property)}>
                        <PlusCircle className="h-4 w-4 mr-1" />
                        添加
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground">
              {searchTerm || filter !== 'all' ? '没有找到匹配的属性' : '属性库为空'}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 